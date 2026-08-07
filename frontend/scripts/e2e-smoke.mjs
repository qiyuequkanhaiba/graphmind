import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchChrome, removeDirectory, stopProcess } from "./layout-audit-runtime.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

let viteServer;
let chrome;
let chromeUserDataDir;
let cdp;

async function main() {
  const backendBaseUrl = process.env.GRAPHMIND_E2E_BASE_URL ?? "http://127.0.0.1:8000";
  const browserAuth = readBrowserAuth();
  await ensureBackendHealthy(backendBaseUrl);
  await ensureSearchFixture(backendBaseUrl, browserAuth);

  viteServer = await createViteServer(backendBaseUrl);
  const appUrl = viteServer.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5173/";
  const chromeRuntime = await launchChrome({ profilePrefix: "graphmind-e2e-" });
  chrome = chromeRuntime.chrome;
  chromeUserDataDir = chromeRuntime.userDataDir;
  const chromeEndpoint = chromeRuntime.chromeEndpoint;
  cdp = await CdpClient.connect(chromeEndpoint);
  const targetId = await cdp.send("Target.createTarget", { url: "about:blank" }).then((result) => result.targetId);
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    flatten: true,
    targetId
  });
  const browserIssues = collectBrowserIssues(cdp, sessionId);

  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);

  await navigate(sessionId, appUrl);
  if (browserAuth) {
    await loginThroughBrowser(sessionId, browserAuth);
  }
  await waitForWorkbench(sessionId);
  if (browserAuth) {
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
    await waitForWorkbench(sessionId);
  }
  await assertSelectorVisible(sessionId, ".workbench-header");
  await assertSelectorVisible(sessionId, ".graph-panel");

  await clickAndWait(sessionId, ".workbench-search-toggle");
  await typeInto(sessionId, "input[aria-label='搜索'], input[aria-label='Search']", "Orders");
  await waitForSelector(sessionId, ".workbench-search-results button");
  await clickAndWait(
    sessionId,
    "button[aria-label='关闭搜索'], button[aria-label='Close search']"
  );

  await clickAndWait(
    sessionId,
    ".workbench-header-action[aria-label='打开命令面板'], .workbench-header-action[aria-label='Open command palette']"
  );
  await typeInto(
    sessionId,
    "input[aria-label='搜索命令'], input[aria-label='Search commands']",
    "layout"
  );
  await waitForSelector(sessionId, ".command-palette-results button");
  await pressKey(sessionId, "Escape", "Escape", 27);
  await waitForSelectorAbsent(sessionId, ".command-palette");

  await clickAndWait(
    sessionId,
    ".workbench-header-action[aria-label='打开数据导入'], .workbench-header-action[aria-label='Open data intake']"
  );
  await assertSelectorVisible(sessionId, ".data-actions-dialog");
  await pressKey(sessionId, "Escape", "Escape", 27);
  await waitForSelectorAbsent(sessionId, ".data-actions-dialog");

  await clickAndWait(
    sessionId,
    ".workbench-header-action[aria-label='打开 AI 配置'], .workbench-header-action[aria-label='Open AI settings']"
  );
  await assertSelectorVisible(sessionId, ".ai-settings-panel");
  await pressKey(sessionId, "Escape", "Escape", 27);
  await waitForSelectorAbsent(sessionId, ".ai-settings-panel");

  await wait(250);
  if (browserIssues.length > 0) {
    throw new Error(`Browser console/runtime issues:\n${browserIssues.join("\n")}`);
  }

  console.log("E2E smoke passed: workbench search, command palette, data intake, and AI settings are interactive.");
}

async function ensureBackendHealthy(baseUrl) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/health`);
  if (!response.ok) {
    throw new Error(`Backend health check failed: ${response.status}`);
  }
}

async function ensureSearchFixture(baseUrl, credentials) {
  const apiBaseUrl = `${normalizeBaseUrl(baseUrl)}/api`;
  const auth = credentials ? await createBackendSession(apiBaseUrl, credentials) : null;
  const projectResponse = await authenticatedFetch(
    `${apiBaseUrl}/projects/default`,
    { method: "POST" },
    auth
  );
  if (!projectResponse.ok) {
    throw new Error(`Default project setup failed: ${projectResponse.status}`);
  }
  const project = await projectResponse.json();
  const graphResponse = await authenticatedFetch(`${apiBaseUrl}/projects/${project.id}/graph`, {}, auth);
  if (!graphResponse.ok) {
    throw new Error(`Graph fixture check failed: ${graphResponse.status}`);
  }
  const graph = await graphResponse.json();
  if (graph.nodes?.some((node) => node.label === "Orders")) {
    return;
  }
  const importResponse = await authenticatedFetch(
    `${apiBaseUrl}/projects/${project.id}/sample-import`,
    { method: "POST" },
    auth
  );
  if (!importResponse.ok) {
    throw new Error(`Sample graph setup failed: ${importResponse.status}`);
  }
}

function readBrowserAuth() {
  const username = process.env.GRAPHMIND_E2E_USERNAME?.trim();
  const password = process.env.GRAPHMIND_E2E_PASSWORD;
  if (!username && !password) {
    return null;
  }
  if (!username || !password) {
    throw new Error("Set both GRAPHMIND_E2E_USERNAME and GRAPHMIND_E2E_PASSWORD.");
  }
  return { password, username };
}

async function createBackendSession(apiBaseUrl, credentials) {
  const response = await fetch(`${apiBaseUrl}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });
  if (!response.ok) {
    throw new Error(`E2E backend login failed: ${response.status}`);
  }
  const session = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  if (!cookie || !session.csrf_token) {
    throw new Error("E2E backend login did not return its session cookie and CSRF token.");
  }
  return { cookie, csrfToken: session.csrf_token };
}

function authenticatedFetch(url, init, auth) {
  if (!auth) {
    return fetch(url, init);
  }
  const headers = new Headers(init.headers);
  headers.set("Cookie", auth.cookie);
  if (["DELETE", "PATCH", "POST", "PUT"].includes((init.method ?? "GET").toUpperCase())) {
    headers.set("X-CSRF-Token", auth.csrfToken);
  }
  return fetch(url, { ...init, headers });
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}

async function createViteServer(backendBaseUrl) {
  const server = await createServer({
    configFile: join(frontendRoot, "vite.config.ts"),
    root: frontendRoot,
    server: {
      host: "127.0.0.1",
      port: Number(process.env.GRAPHMIND_E2E_PORT ?? 5173),
      proxy: {
        "/api": normalizeBaseUrl(backendBaseUrl)
      },
      strictPort: false
    }
  });
  await server.listen();
  return server;
}

async function navigate(sessionId, appUrl) {
  await cdp.send("Page.navigate", { url: appUrl }, sessionId);
}

async function waitForWorkbench(sessionId) {
  await waitUntil(async () =>
    Boolean(
      await evaluate(
        sessionId,
        "Boolean(document.querySelector('.workbench-shell') && document.querySelector('.graph-panel'))"
      ).catch(() => false)
    ), 12000);
}

async function waitForSelector(sessionId, selector) {
  await waitUntil(async () => Boolean(await evaluate(sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`).catch(() => false)), 8000);
}

async function waitForSelectorAbsent(sessionId, selector) {
  await waitUntil(async () =>
    Boolean(
      await evaluate(
        sessionId,
        `!document.querySelector(${JSON.stringify(selector)})`
      ).catch(() => false)
    ), 8000);
}

async function assertSelectorVisible(sessionId, selector) {
  const visible = await evaluate(
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    })()`
  );
  if (!visible) {
    throw new Error(`Expected visible selector: ${selector}`);
  }
}

async function clickAndWait(sessionId, selector) {
  const point = await evaluate(
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) {
        throw new Error("Missing selector: ${selector}");
      }
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`
  );
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId);
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", button: "left", clickCount: 1, ...point },
    sessionId
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", button: "left", clickCount: 1, ...point },
    sessionId
  );
  await wait(180);
}

async function typeInto(sessionId, selector, value) {
  await evaluate(
    sessionId,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) {
        throw new Error("Missing selector: ${selector}");
      }
      input.focus();
      input.select?.();
    })()`
  );
  await cdp.send("Input.insertText", { text: value }, sessionId);
}

async function pressKey(sessionId, key, code, windowsVirtualKeyCode) {
  const params = { code, key, nativeVirtualKeyCode: windowsVirtualKeyCode, windowsVirtualKeyCode };
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" }, sessionId);
  await wait(180);
}

async function loginThroughBrowser(sessionId, credentials) {
  await waitForSelector(sessionId, ".auth-login-form");
  await typeInto(sessionId, "input[name='username']", credentials.username);
  await typeInto(sessionId, "input[name='password']", credentials.password);
  await clickAndWait(sessionId, ".auth-login-form button[type='submit']");
}

function collectBrowserIssues(client, sessionId) {
  const issues = [];
  client.on("Log.entryAdded", (params, message) => {
    if (message.sessionId === sessionId && ["error", "warning"].includes(params.entry?.level)) {
      issues.push(`[${params.entry.level}] ${params.entry.text}`);
    }
  });
  client.on("Runtime.exceptionThrown", (params, message) => {
    if (message.sessionId === sessionId) {
      issues.push(`[exception] ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "Unknown runtime exception"}`);
    }
  });
  client.on("Runtime.consoleAPICalled", (params, message) => {
    if (message.sessionId !== sessionId || !["error", "warning"].includes(params.type)) {
      return;
    }
    const value = (params.args ?? []).map((argument) => argument.value ?? argument.description ?? "").join(" ");
    issues.push(`[console.${params.type}] ${value}`);
  });
  return issues;
}

async function evaluate(sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      awaitPromise: true,
      expression,
      returnByValue: true
    },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed");
  }
  return result.result.value;
}

async function waitUntil(predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await wait(80);
  }
  throw new Error("Timed out waiting for condition");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  #eventHandlers = new Map();
  #id = 0;
  #pending = new Map();
  #socket;

  static async connect(wsUrl) {
    const client = new CdpClient(wsUrl);
    await client.#open();
    return client;
  }

  constructor(wsUrl) {
    this.#socket = new WebSocket(wsUrl);
  }

  #open() {
    return new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
      this.#socket.addEventListener("message", (event) => this.#handleMessage(event));
    });
  }

  #handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      this.#emitEvent(message);
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result ?? {});
    }
  }

  #emitEvent(message) {
    if (!message.method) {
      return;
    }
    const handlers = this.#eventHandlers.get(message.method) ?? [];
    for (const handler of handlers) {
      handler(message.params ?? {}, message);
    }
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.#id;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.#socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
    });
  }

  on(method, handler) {
    const handlers = this.#eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.#eventHandlers.set(method, handlers);
    return () => {
      this.#eventHandlers.set(method, handlers.filter((candidate) => candidate !== handler));
    };
  }

  close() {
    this.#socket.close();
  }
}

try {
  await main();
} finally {
  if (cdp) {
    cdp.close();
  }
  const chromeStopped = await stopProcess(chrome);
  if (chromeUserDataDir && chromeStopped) {
    removeDirectory(chromeUserDataDir);
  } else if (chromeUserDataDir) {
    console.warn(`Chrome did not exit; temporary directory was preserved: ${chromeUserDataDir}`);
  }
  if (viteServer) {
    await viteServer.close();
  }
}
