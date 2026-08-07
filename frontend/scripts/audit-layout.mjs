import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  launchChrome,
  navigateToWorkbench,
  removeDirectory,
  stopProcess
} from "./layout-audit-runtime.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "compact-mobile", width: 375, height: 667, mobile: true }
];

const STATES = [
  { name: "graph-default", setup: "" },
  { name: "light-theme", setup: "switchLightTheme" },
  { name: "graph-tools", setup: "openGraphTools" },
  { name: "graph-analysis-drawer", setup: "openGraphAnalysisDrawer" },
  { name: "search-open", setup: "openSearch" },
  { name: "command-palette", setup: "openCommandPalette" },
  { name: "data-module", setup: "openDataModule" },
  { name: "insights-evidence", setup: "openInsightsEvidence" },
  { name: "insights-review", setup: "openInsightsReview" },
  { name: "insights-ai", setup: "openInsightsAi" },
  { name: "data-dialog", setup: "openDataDialog" },
  { name: "ai-settings-dialog", setup: "openAiSettingsDialog" },
  { name: "project-sharing-dialog", setup: "openProjectSharingDialog" }
];

const REQUIRED_STATE_SELECTORS = {
  openAiSettingsDialog: ".ai-settings-panel",
  openCommandPalette: ".command-palette",
  openDataDialog: ".data-actions-dialog",
  openProjectSharingDialog: ".project-sharing-dialog",
  openSearch: ".workbench-search"
};

const outputDir = resolve(
  repoRoot,
  process.env.GRAPHMIND_AUDIT_OUTPUT_DIR ?? "tmp-layout-audit-auto"
);
const shouldCaptureScreenshots = process.env.GRAPHMIND_AUDIT_SCREENSHOTS !== "0";

let viteServer;
let chrome;
let chromeUserDataDir;
let cdp;

async function createViteServer() {
  const server = await createServer({
    configFile: join(frontendRoot, "vite.config.ts"),
    root: frontendRoot,
    server: {
      host: "127.0.0.1",
      port: Number(process.env.GRAPHMIND_AUDIT_PORT ?? 5173),
      strictPort: false
    }
  });
  await server.listen();
  return server;
}

async function auditState({ appUrl, cdp, consoleIssueCollector, sessionId, state, viewport }) {
  const consoleIssueCursor = consoleIssueCollector.mark({
    state: state.name,
    viewport: viewport.name
  });
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      deviceScaleFactor: viewport.mobile ? 2 : 1,
      height: viewport.height,
      mobile: Boolean(viewport.mobile),
      width: viewport.width
    },
    sessionId
  );
  await navigateToWorkbench({
    appUrl,
    cdp,
    collectDiagnostics: () => collectWorkbenchDiagnostics(cdp, sessionId),
    getConsoleIssues: () => consoleIssueCollector.collectSince(consoleIssueCursor),
    sessionId,
    state,
    viewport,
    wait,
    waitForWorkbench
  });
  await performStateSetup(cdp, sessionId, state.setup);
  await wait(180);

  const metrics = await evaluate(cdp, sessionId, `(${collectLayoutMetrics.toString()})()`);
  const stateTargetProblems = await collectRequiredStateTargetProblems(cdp, sessionId, state.setup);
  metrics.problems.push(...stateTargetProblems);
  const screenshotPath =
    shouldCaptureScreenshots && metrics.workbenchReady
      ? await captureScreenshot(cdp, sessionId, viewport, state)
      : null;
  const keyboardProblems = await auditKeyboardInteraction({ cdp, sessionId, state });
  metrics.problems.push(...keyboardProblems);
  const consoleIssues = consoleIssueCollector.collectSince(consoleIssueCursor);
  const unexpectedConsoleIssues = consoleIssues.filter((issue) => !issue.allowed);
  metrics.problems.push(
    ...unexpectedConsoleIssues.map((issue) => ({
      level: issue.level,
      source: issue.source,
      text: issue.text,
      type: "unexpectedConsoleIssue"
    }))
  );

  return {
    metrics,
    problems: metrics.problems,
    consoleIssues,
    consoleIssueCount: consoleIssues.length,
    allowedConsoleIssueCount: consoleIssues.filter((issue) => issue.allowed).length,
    unexpectedConsoleIssueCount: unexpectedConsoleIssues.length,
    screenshotPath,
    state: state.name,
    viewport
  };
}

async function auditKeyboardInteraction({ cdp, sessionId, state }) {
  if (state.setup === "openSearch") {
    const keyboardResult = await evaluate(
      cdp,
      sessionId,
      `(${testSearchKeyboardInteraction.toString()})()`
    );
    return keyboardResult.problems;
  }

  if (state.setup === "openCommandPalette") {
    const keyboardResult = await evaluate(
      cdp,
      sessionId,
      `(${testCommandPaletteKeyboardInteraction.toString()})()`
    );
    return keyboardResult.problems;
  }

  if (!["openDataDialog", "openAiSettingsDialog", "openProjectSharingDialog"].includes(state.setup)) {
    return [];
  }

  const dialogSelector = {
    openAiSettingsDialog: ".ai-settings-panel",
    openDataDialog: ".data-actions-dialog",
    openProjectSharingDialog: ".project-sharing-dialog"
  }[state.setup];
  const openerSelector = {
    openAiSettingsDialog: ".workbench-header-action[aria-label='打开 AI 配置']",
    openDataDialog: "[aria-label='打开数据导入']",
    openProjectSharingDialog: ".workbench-header-action[aria-label='项目分享']"
  }[state.setup];
  const keyboardResult = await evaluate(
    cdp,
    sessionId,
    `(${testDialogKeyboardInteraction.toString()})(${JSON.stringify({
      dialogSelector,
      openerSelector
    })})`
  );
  return keyboardResult.problems;
}

async function performStateSetup(cdp, sessionId, setup) {
  if (!setup) {
    return;
  }
  await evaluate(
    cdp,
    sessionId,
    `(${runWorkbenchSetup.toString()})(${JSON.stringify(setup)})`
  );
}

async function collectRequiredStateTargetProblems(cdp, sessionId, setup) {
  const selector = REQUIRED_STATE_SELECTORS[setup];
  if (!selector) {
    return [];
  }

  const targetStatus = await evaluate(
    cdp,
    sessionId,
    `(${getRequiredStateTargetStatus.toString()})(${JSON.stringify(selector)})`
  );
  if (targetStatus.visible) {
    return [];
  }

  return [
    {
      reason: targetStatus.reason,
      selector,
      setup,
      type: "missingStateTarget"
    }
  ];
}

async function waitForWorkbench(cdp, sessionId) {
  await waitUntil(async () => {
    const ready = await evaluate(
      cdp,
      sessionId,
      "Boolean(document.querySelector('.workbench-shell') && document.querySelector('.graph-panel'))"
    ).catch(() => false);
    return Boolean(ready);
  }, 12000);
  await wait(220);
}

async function collectWorkbenchDiagnostics(cdp, sessionId) {
  return evaluate(
    cdp,
    sessionId,
    "({ bodyText: document.body?.innerText?.slice(0, 240) ?? '', readyState: document.readyState, rootPresent: Boolean(document.querySelector('#root')), url: location.href, workbenchReady: Boolean(document.querySelector('.workbench-shell') && document.querySelector('.graph-panel')) })"
  );
}

async function captureScreenshot(cdp, sessionId, viewport, state) {
  const result = await cdp.send(
    "Page.captureScreenshot",
    { captureBeyondViewport: false, format: "png" },
    sessionId
  );
  const screenshotPath = join(outputDir, `${viewport.name}-${state.name}.png`);
  writeFileSync(screenshotPath, Buffer.from(result.data, "base64"));
  return screenshotPath;
}

async function evaluate(cdp, sessionId, expression) {
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

function createConsoleIssueCollector(cdp, sessionId) {
  const issues = [];
  const disposeHandlers = [
    cdp.on("Runtime.consoleAPICalled", (params, message) => {
      if (message.sessionId !== sessionId || !isGovernedConsoleLevel(params.type)) {
        return;
      }
      recordConsoleIssue({
        level: params.type,
        source: "Runtime.consoleAPICalled",
        text: formatConsoleArgs(params.args)
      });
    }),
    cdp.on("Log.entryAdded", (params, message) => {
      if (message.sessionId !== sessionId || !isGovernedConsoleLevel(params.entry?.level)) {
        return;
      }
      recordConsoleIssue({
        level: params.entry.level,
        source: "Log.entryAdded",
        text: params.entry.text ?? "",
        url: params.entry.url
      });
    })
  ];

  return {
    collectSince(cursor) {
      return issues
        .slice(cursor.index)
        .map((issue) => ({
          ...issue,
          state: issue.state ?? cursor.state,
          viewport: issue.viewport ?? cursor.viewport
        }));
    },
    dispose() {
      for (const disposeHandler of disposeHandlers) {
        disposeHandler();
      }
    },
    get issues() {
      return issues;
    },
    mark(context) {
      return {
        index: issues.length,
        state: context.state,
        viewport: context.viewport
      };
    }
  };

  function recordConsoleIssue(issue) {
    const text = normalizeConsoleText(issue.text);
    if (!text) {
      return;
    }
    issues.push({
      allowed: false,
      level: normalizeConsoleLevel(issue.level),
      source: issue.source,
      text,
      url: issue.url
    });
  }
}

function isGovernedConsoleLevel(level) {
  return ["error", "warning", "warn"].includes(String(level).toLowerCase());
}

function normalizeConsoleLevel(level) {
  const normalized = String(level).toLowerCase();
  return normalized === "warning" ? "warn" : normalized;
}

function formatConsoleArgs(args = []) {
  return args
    .map((arg) => {
      if (typeof arg.value === "string") {
        return arg.value;
      }
      if (arg.unserializableValue) {
        return arg.unserializableValue;
      }
      if (arg.description) {
        return arg.description;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeConsoleText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function runWorkbenchSetup(setup) {
  const click = (selector, index = 0) => {
    const element = document.querySelectorAll(selector)[index];
    if (!element) {
      throw new Error(`Missing selector: ${selector}`);
    }
    element.focus({ preventScroll: true });
    element.click();
  };

  const typeInto = (selector, value) => {
    const input = document.querySelector(selector);
    if (!input) {
      throw new Error(`Missing selector: ${selector}`);
    }
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    input.focus();
    nativeValueSetter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  };

  if (setup === "openGraphTools") {
    click(".graph-tools-toggle");
  }
  if (setup === "switchLightTheme") {
    click(".workbench-theme-toggle");
  }
  if (setup === "openGraphAnalysisDrawer") {
    click(".graph-analysis-toggle");
  }
  if (setup === "openSearch") {
    click(".workbench-search-toggle");
    requestAnimationFrame(() => typeInto(".workbench-search input", "customer"));
  }
  if (setup === "openCommandPalette") {
    click("[aria-label='打开命令面板']");
  }
  if (setup === "openDataModule") {
    click(".workbench-module-tabs button[role='tab']", 1);
  }
  if (setup === "openInsightsEvidence") {
    click(".workbench-module-tabs button[role='tab']", 2);
    click(".insight-tabs button[role='tab']", 0);
  }
  if (setup === "openInsightsReview") {
    click(".workbench-module-tabs button[role='tab']", 2);
    click(".insight-tabs button[role='tab']", 1);
  }
  if (setup === "openInsightsAi") {
    click(".workbench-module-tabs button[role='tab']", 2);
    click(".insight-tabs button[role='tab']", 2);
  }
  if (setup === "openDataDialog") {
    click("[aria-label='打开数据导入']");
  }
  if (setup === "openAiSettingsDialog") {
    click(".workbench-header-action[aria-label='打开 AI 配置']");
  }
  if (setup === "openProjectSharingDialog") {
    click(".workbench-header-action[aria-label='项目分享']");
  }
}

function getRequiredStateTargetStatus(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    return { reason: "not-found", visible: false };
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return { reason: "not-visible", visible: false };
  }

  return {
    rect: {
      height: Math.round(rect.height * 100) / 100,
      width: Math.round(rect.width * 100) / 100
    },
    visible: true
  };
}

function collectLayoutMetrics() {
  const viewport = { height: window.innerHeight, width: window.innerWidth };
  const pageHorizontalOverflow = Math.max(
    0,
    document.documentElement.scrollWidth - viewport.width,
    document.body.scrollWidth - viewport.width
  );
  const problems = [];
  const rects = {};

  const trackedSelectors = {
    aiSettingsPanel: ".ai-settings-panel",
    chatForm: ".chat-form",
    chatMessages: ".chat-messages",
    commandPalette: ".command-palette",
    dataActionsDialog: ".data-actions-dialog",
    dataExplorerPanel: ".data-explorer-panel",
    graphAnalysisDrawer: ".graph-analysis-drawer",
    graphCanvas: ".graph-canvas",
    graphHeading: ".graph-heading",
    graphPanel: ".graph-panel",
    graphToolsDrawer: ".graph-tools-drawer",
    header: ".workbench-header",
    insightPanel: ".insight-panel",
    projectSharingDialog: ".project-sharing-dialog",
    searchPanel: ".workbench-search",
    statusBar: ".workbench-status-bar"
  };

  for (const [name, selector] of Object.entries(trackedSelectors)) {
    rects[name] = getVisibleRect(selector);
  }

  if (pageHorizontalOverflow > 1) {
    problems.push({ amount: pageHorizontalOverflow, type: "pageHorizontalOverflow" });
  }

  const importantRects = [
    "aiSettingsPanel",
    "chatForm",
    "chatMessages",
    "commandPalette",
    "dataActionsDialog",
    "graphAnalysisDrawer",
    "graphCanvas",
    "graphHeading",
    "graphToolsDrawer",
    "header",
    "projectSharingDialog",
    "searchPanel",
    "statusBar"
  ];
  for (const name of importantRects) {
    const rect = rects[name];
    if (rect && isOutOfViewport(rect, viewport)) {
      problems.push({ rect, target: name, type: "importantComponentOutOfViewport" });
    }
  }

  const graphCanvas = rects.graphCanvas;
  if (graphCanvas) {
    const minGraphHeight = viewport.width <= 640 ? 210 : viewport.width <= 1080 ? 300 : 340;
    const minGraphWidth = viewport.width <= 640 ? 280 : 420;
    if (graphCanvas.height < minGraphHeight || graphCanvas.width < minGraphWidth) {
      problems.push({
        height: graphCanvas.height,
        minGraphHeight,
        minGraphWidth,
        type: "graphCanvasTooSmall",
        width: graphCanvas.width
      });
    }
  }

  if (rects.chatMessages && rects.chatMessages.height < 112) {
    problems.push({
      height: rects.chatMessages.height,
      type: "chatMessagesTooSmall"
    });
  }

  if (rects.header && rects.graphHeading && intersects(rects.header, rects.graphHeading)) {
    problems.push({ type: "graphHeadingHeaderOverlap" });
  }

  if (rects.statusBar && rects.chatForm && intersects(rects.statusBar, rects.chatForm)) {
    problems.push({ type: "chatFormStatusBarOverlap" });
  }

  if (rects.searchPanel) {
    const maxSearchHeight = viewport.height <= 720 ? 210 : viewport.width <= 640 ? 252 : 360;
    if (rects.searchPanel.height > maxSearchHeight) {
      problems.push({
        height: rects.searchPanel.height,
        maxSearchHeight,
        type: "searchPanelTooTall"
      });
    }
  }

  if (rects.graphToolsDrawer) {
    const maxDrawerHeight = viewport.width <= 640 && viewport.height <= 720 ? 304 : Math.min(viewport.height * 0.6, 430);
    if (rects.graphToolsDrawer.height > maxDrawerHeight) {
      problems.push({
        height: rects.graphToolsDrawer.height,
        maxDrawerHeight,
        type: "graphToolsDrawerTooTall"
      });
    }
  }

  if (rects.commandPalette) {
    const maxPaletteHeight = viewport.height - 24;
    if (rects.commandPalette.height > maxPaletteHeight) {
      problems.push({
        height: rects.commandPalette.height,
        maxPaletteHeight,
        type: "commandPaletteTooTall"
      });
    }
  }

  const aiSettingsDialog = document.querySelector(".ai-settings-panel");
  if (aiSettingsDialog) {
    if (aiSettingsDialog.getAttribute("role") !== "dialog") {
      problems.push({ type: "aiSettingsMissingDialogRole" });
    }
    if (aiSettingsDialog.getAttribute("aria-modal") !== "true") {
      problems.push({ type: "aiSettingsMissingAriaModal" });
    }
    if (!aiSettingsDialog.getAttribute("aria-labelledby")) {
      problems.push({ type: "aiSettingsMissingLabel" });
    }
  }

  const projectSharingDialog = document.querySelector(".project-sharing-dialog");
  if (projectSharingDialog) {
    if (projectSharingDialog.getAttribute("role") !== "dialog") {
      problems.push({ type: "projectSharingMissingDialogRole" });
    }
    if (projectSharingDialog.getAttribute("aria-modal") !== "true") {
      problems.push({ type: "projectSharingMissingAriaModal" });
    }
    if (!projectSharingDialog.getAttribute("aria-labelledby")) {
      problems.push({ type: "projectSharingMissingLabel" });
    }
  }

  return {
    pageHorizontalOverflow,
    problems,
    rects,
    viewport,
    workbenchReady: Boolean(document.querySelector(".workbench-shell"))
  };

  function getVisibleRect(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }
    return {
      bottom: round(rect.bottom),
      height: round(rect.height),
      left: round(rect.left),
      right: round(rect.right),
      top: round(rect.top),
      width: round(rect.width)
    };
  }

  function isOutOfViewport(rect, viewport) {
    const tolerance = 2;
    return (
      rect.left < -tolerance ||
      rect.top < -tolerance ||
      rect.right > viewport.width + tolerance ||
      rect.bottom > viewport.height + tolerance
    );
  }

  function intersects(left, right) {
    const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
    const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
    return overlapWidth > 1 && overlapHeight > 1;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
}

async function testDialogKeyboardInteraction({ dialogSelector, openerSelector }) {
  const problems = [];
  const dialog = document.querySelector(dialogSelector);
  const opener = document.querySelector(openerSelector);
  if (!dialog) {
    return {
      problems: [{ dialogSelector, type: "dialogKeyboardTargetMissing" }]
    };
  }

  const focusableElements = getFocusableElements(dialog);
  if (focusableElements.length === 0) {
    return {
      problems: [{ dialogSelector, type: "dialogFocusableControlsMissing" }]
    };
  }

  if (!dialog.contains(document.activeElement)) {
    problems.push({ dialogSelector, type: "dialogInitialFocusMissing" });
  }

  const escapeEvent = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Escape"
  });
  dialog.dispatchEvent(escapeEvent);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  if (document.querySelector(dialogSelector)) {
    problems.push({ dialogSelector, type: "dialogEscapeCloseFailed" });
  }
  if (opener && document.activeElement !== opener) {
    problems.push({ dialogSelector, type: "dialogFocusRestoreFailed" });
  }

  return { problems };

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "[tabindex]:not([tabindex='-1'])"
        ].join(",")
      )
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.tabIndex >= 0 &&
        !element.hasAttribute("disabled")
      );
    });
  }
}

async function testSearchKeyboardInteraction() {
  const problems = [];
  const input = document.querySelector(".workbench-search input");
  const opener = document.querySelector(".workbench-search-toggle");
  const listbox = document.querySelector(".workbench-search-results[role='listbox']");
  const options = Array.from(document.querySelectorAll(".workbench-search-results [role='option']"));

  if (!input || !opener || !listbox || options.length < 2) {
    return {
      problems: [{ type: "searchKeyboardTargetMissing" }]
    };
  }

  input.focus();
  input.dispatchEvent(createKeyboardEvent("ArrowDown"));
  await nextFrames();

  const firstOption = options[0];
  const secondOption = options[1];
  const firstOptionSelected = firstOption.getAttribute("aria-selected") === "true";
  if (document.activeElement !== firstOption || !firstOptionSelected) {
    problems.push({ type: "searchKeyboardNavigationFailed" });
  }

  firstOption.dispatchEvent(createKeyboardEvent("ArrowDown"));
  await nextFrames();

  const secondOptionSelected = secondOption.getAttribute("aria-selected") === "true";
  if (document.activeElement !== secondOption || !secondOptionSelected) {
    problems.push({ type: "searchKeyboardNavigationFailed" });
  }

  input.dispatchEvent(createKeyboardEvent("Escape"));
  await nextFrames();

  if (document.querySelector(".workbench-search")) {
    problems.push({ type: "searchEscapeCloseFailed" });
  }
  if (document.activeElement !== opener) {
    problems.push({ type: "searchFocusRestoreFailed" });
  }

  return { problems };

  function createKeyboardEvent(key) {
    return new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key
    });
  }

  function nextFrames() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
}

async function testCommandPaletteKeyboardInteraction() {
  const problems = [];
  const dialog = document.querySelector(".command-palette[role='dialog']");
  const input = document.querySelector(".command-palette input");
  const opener = document.querySelector("[aria-label='打开命令面板']");
  const listbox = document.querySelector(".command-palette-results[role='listbox']");
  const options = Array.from(document.querySelectorAll(".command-palette-results [role='option']"));

  if (!dialog || !input || !opener || !listbox || options.length < 2) {
    return {
      problems: [{ type: "commandPaletteKeyboardTargetMissing" }]
    };
  }

  if (document.activeElement !== input) {
    problems.push({ type: "commandPaletteInitialFocusMissing" });
  }

  input.dispatchEvent(createKeyboardEvent("ArrowDown"));
  await nextFrames();

  const firstOption = options[0];
  const secondOption = options[1];
  const firstOptionSelected = firstOption.getAttribute("aria-selected") === "true";
  if (document.activeElement !== firstOption || !firstOptionSelected) {
    problems.push({ type: "commandPaletteKeyboardNavigationFailed" });
  }

  firstOption.dispatchEvent(createKeyboardEvent("ArrowDown"));
  await nextFrames();

  const secondOptionSelected = secondOption.getAttribute("aria-selected") === "true";
  if (document.activeElement !== secondOption || !secondOptionSelected) {
    problems.push({ type: "commandPaletteKeyboardNavigationFailed" });
  }

  secondOption.dispatchEvent(createKeyboardEvent("Escape"));
  await nextFrames();

  if (document.querySelector(".command-palette")) {
    problems.push({ type: "commandPaletteEscapeCloseFailed" });
  }
  if (document.activeElement !== opener) {
    problems.push({ type: "commandPaletteFocusRestoreFailed" });
  }

  return { problems };

  function createKeyboardEvent(key) {
    return new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key
    });
  }

  function nextFrames() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
}

function createApiMockScript() {
  return `
    (() => {
      const graph = {
        nodes: [
          { id: 1, node_type: "table", label: "Orders", source_ref: "orders", metadata: { row_count: 1200, column_count: 4 }, position_x: 80, position_y: 80 },
          { id: 2, node_type: "field", label: "Orders.customer_id", source_ref: "orders.customer_id", metadata: { inferred_type: "identifier", key_candidate_score: 0.91 }, position_x: 80, position_y: 190 },
          { id: 3, node_type: "field", label: "Orders.order_date", source_ref: "orders.order_date", metadata: { inferred_type: "datetime" }, position_x: 80, position_y: 300 },
          { id: 4, node_type: "table", label: "Customers", source_ref: "customers", metadata: { row_count: 640, column_count: 3 }, position_x: 420, position_y: 80 },
          { id: 5, node_type: "field", label: "Customers.customer_id", source_ref: "customers.customer_id", metadata: { inferred_type: "identifier", key_candidate_score: 0.99 }, position_x: 420, position_y: 190 },
          { id: 6, node_type: "field", label: "Customers.segment", source_ref: "customers.segment", metadata: { inferred_type: "category" }, position_x: 420, position_y: 300 },
          { id: 7, node_type: "entity", label: "Customer Segment", source_ref: "dimension:customer_segment", metadata: { dimension_type: "business" }, position_x: 720, position_y: 245 }
        ],
        edges: [
          { id: 10, source_node_id: 1, target_node_id: 2, edge_type: "contains_field", confidence: 1, status: "auto_trusted", evidence_ref: "field:orders.customer_id", created_from_suggestion_id: null, metadata: {}, evidence_summary: null, evidence_payload: null },
          { id: 11, source_node_id: 1, target_node_id: 3, edge_type: "contains_field", confidence: 1, status: "auto_trusted", evidence_ref: "field:orders.order_date", created_from_suggestion_id: null, metadata: {}, evidence_summary: null, evidence_payload: null },
          { id: 12, source_node_id: 4, target_node_id: 5, edge_type: "contains_field", confidence: 1, status: "auto_trusted", evidence_ref: "field:customers.customer_id", created_from_suggestion_id: null, metadata: {}, evidence_summary: null, evidence_payload: null },
          { id: 13, source_node_id: 4, target_node_id: 6, edge_type: "contains_field", confidence: 1, status: "auto_trusted", evidence_ref: "field:customers.segment", created_from_suggestion_id: null, metadata: {}, evidence_summary: null, evidence_payload: null },
          { id: 14, source_node_id: 2, target_node_id: 5, edge_type: "foreign_key", confidence: 0.94, status: "suggested", evidence_ref: "suggestion:8", created_from_suggestion_id: 8, metadata: {}, evidence_summary: "Customer IDs overlap across imported sheets.", evidence_payload: { overlap_count: 420 } },
          { id: 15, source_node_id: 6, target_node_id: 7, edge_type: "derived_dimension", confidence: 0.76, status: "suggested", evidence_ref: "suggestion:9", created_from_suggestion_id: 9, metadata: {}, evidence_summary: "Customer segment can be explored as a dimension.", evidence_payload: { unique_values: 4 } }
        ]
      };
      const suggestions = [
        { id: 8, source_field_id: 2, target_field_id: 5, source_label: "Orders.customer_id", target_label: "Customers.customer_id", relationship_type: "foreign_key", confidence: 0.94, evidence_summary: "Customer IDs overlap across imported sheets.", evidence_payload: { overlap_count: 420 }, decision_status: "pending" },
        { id: 9, source_field_id: 6, target_field_id: null, source_label: "Customers.segment", target_label: "Customer Segment", relationship_type: "derived_dimension", confidence: 0.76, evidence_summary: "Customer segment can be explored as a dimension.", evidence_payload: { unique_values: 4 }, decision_status: "pending" }
      ];
      const settings = {
        ai: {
          chat: { provider: "rules", model: "graphmind-rules", base_url: "", api_key: "", temperature: 0.1 },
          vector: { provider: "none", model: "", base_url: "", api_key: "", dimensions: 0, index_status: "not_built", document_count: 0, last_built_at: null, embedding_model: "" }
        }
      };
      const sourceSummaries = [{ source_kind: "table", count: 2 }];
      const sourceDetails = [];
      const relationshipGovernance = {
        total_suggestion_count: 2,
        visible_suggestion_count: 2,
        duplicate_suggestion_count: 0,
        duplicate_group_count: 0,
        pending_suggestion_count: 2,
        accepted_suggestion_count: 0,
        rejected_suggestion_count: 0,
        edited_suggestion_count: 0,
        duplicate_groups: []
      };
      const importJobs = [];
      const workspaceSnapshot = {
        workspace_version: "audit-v1",
        project: { id: 1, name: "Default" },
        graph,
        suggestions,
        relationship_governance: relationshipGovernance,
        settings,
        import_jobs: importJobs,
        source_summaries: sourceSummaries,
        source_details: sourceDetails,
        source_chunks_by_source_id: {},
        extracted_entities: [],
        extracted_relationships: [],
        entity_match_reviews: [],
        mapping_reviews: []
      };
      const json = (value, status = 200) => Promise.resolve(new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
        status
      }));
      const originalFetch = window.fetch.bind(window);

      try {
        window.localStorage.setItem("graphmind.language", "zh-CN");
        window.localStorage.removeItem("graphmind.workbenchLayoutPreferences");
      } catch {}

      window.EventSource = class MockEventSource extends EventTarget {
        constructor(url) {
          super();
          this.url = url;
          this.readyState = 1;
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent("message", {
              data: JSON.stringify({ type: "import_job_snapshot", jobs: [] })
            }));
          }, 0);
        }
        close() {
          this.readyState = 2;
        }
      };

      window.fetch = (input, init = {}) => {
        const requestUrl = typeof input === "string" ? input : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? "GET").toUpperCase();
        if (!url.pathname.startsWith("/api")) {
          return originalFetch(input, init);
        }
        if (url.pathname === "/api/projects/default" && method === "POST") {
          return json({ id: 1, name: "Default" });
        }
        if (url.pathname === "/api/projects/1/workspace-snapshot") {
          return json(workspaceSnapshot);
        }
        if (url.pathname === "/api/projects/1/workspace-delta") {
          return json({
            status: "not_modified",
            workspace_version: "audit-v1",
            graph: null,
            suggestions: null,
            relationship_governance: null,
            import_jobs: null,
            source_summaries: null,
            source_details: null,
            extracted_entities: null,
            extracted_relationships: null,
            entity_match_reviews: null,
            mapping_reviews: null
          });
        }
        if (url.pathname === "/api/projects/1/graph") {
          return json(graph);
        }
        if (url.pathname === "/api/projects/1/relationship-suggestions") {
          return json(suggestions);
        }
        if (url.pathname === "/api/projects/1/settings") {
          return json(settings);
        }
        if (url.pathname === "/api/projects/1/share-tokens" && method === "GET") {
          return json([]);
        }
        if (url.pathname === "/api/projects/1/import-jobs") {
          return json([]);
        }
        if (url.pathname === "/api/projects/1/sources") {
          return json(sourceSummaries);
        }
        if (url.pathname === "/api/projects/1/sources/detail") {
          return json(sourceDetails);
        }
        if (url.pathname === "/api/projects/1/entities" || url.pathname === "/api/projects/1/extracted-relationships" || url.pathname === "/api/projects/1/entity-matches" || url.pathname === "/api/projects/1/mapping-reviews") {
          return json([]);
        }
        if (url.pathname === "/api/projects/1/relationship-governance") {
          return json(relationshipGovernance);
        }
        if (url.pathname === "/api/projects/1/vector-index/build" && method === "POST") {
          return json(settings);
        }
        return json({ detail: "Mock endpoint not implemented" }, 404);
      };

      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "* { animation-duration: 0ms !important; transition-duration: 0ms !important; }";
        document.head.appendChild(style);
      });
    })();
  `;
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
      this.#eventHandlers.set(
        method,
        (this.#eventHandlers.get(method) ?? []).filter((entry) => entry !== handler)
      );
    };
  }

  close() {
    this.#socket.close();
  }
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

async function stopChrome() {
  return stopProcess(chrome);
}

async function createAuditSession() {
  const targetId = await cdp
    .send("Target.createTarget", { url: "about:blank" })
    .then((result) => result.targetId);
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    flatten: true,
    targetId
  });
  const consoleIssueCollector = createConsoleIssueCollector(cdp, sessionId);

  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: createApiMockScript() },
    sessionId
  );

  return {
    consoleIssueCollector,
    sessionId,
    async close() {
      consoleIssueCollector.dispose();
      try {
        const result = await cdp.send("Target.closeTarget", { targetId });
        if (result.success === false) {
          console.warn(`Layout audit target close failed: target=${targetId}`);
        }
      } catch (error) {
        console.warn(`Layout audit target close failed: target=${targetId} error=${error.message}`);
      }
    }
  };
}

async function main() {
  try {
    viteServer = await createViteServer();
    const appUrl = viteServer.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5173/";
    const chromeRuntime = await launchChrome({ profilePrefix: "graphmind-layout-audit-" });
    chrome = chromeRuntime.chrome;
    chromeUserDataDir = chromeRuntime.userDataDir;
    const chromeEndpoint = chromeRuntime.chromeEndpoint;
    cdp = await CdpClient.connect(chromeEndpoint);

    rmSync(outputDir, { force: true, recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const results = [];
    const problems = [];

    for (const viewport of VIEWPORTS) {
      const auditSession = await createAuditSession();
      try {
        for (const state of STATES) {
          const result = await auditState({
            appUrl,
            cdp,
            consoleIssueCollector: auditSession.consoleIssueCollector,
            sessionId: auditSession.sessionId,
            state,
            viewport
          });
          results.push(result);
          problems.push(
            ...result.problems.map((problem) => ({
              ...problem,
              state: state.name,
              viewport: viewport.name
            }))
          );
        }
      } finally {
        await auditSession.close();
      }
    }
    const consoleIssues = results.flatMap((result) => result.consoleIssues ?? []);
    const allowedConsoleIssueCount = consoleIssues.filter((issue) => issue.allowed).length;
    const unexpectedConsoleIssueCount = consoleIssues.filter((issue) => !issue.allowed).length;

    const report = {
      appUrl,
      allowedConsoleIssueCount,
      consoleIssueCount: consoleIssues.length,
      consoleIssues,
      generatedAt: new Date().toISOString(),
      problems,
      results,
      states: STATES.map((state) => state.name),
      unexpectedConsoleIssueCount,
      viewports: VIEWPORTS
    };

    writeFileSync(join(outputDir, "layout-audit.json"), JSON.stringify(report, null, 2));
    writeFileSync(
      join(outputDir, "layout-audit-summary.json"),
      JSON.stringify(
        {
          allowedConsoleIssueCount,
          consoleIssueCount: consoleIssues.length,
          generatedAt: report.generatedAt,
          problemCount: problems.length,
          problems,
          resultCount: results.length,
          unexpectedConsoleIssueCount
        },
        null,
        2
      )
    );

    if (problems.length > 0) {
      console.error(`Layout audit failed: ${problems.length} problem(s).`);
      console.error(`Report: ${join(outputDir, "layout-audit-summary.json")}`);
      process.exitCode = 1;
    } else {
      console.log(`Layout audit passed: ${results.length} viewport/state checks.`);
      console.log(`Report: ${join(outputDir, "layout-audit-summary.json")}`);
    }
  } finally {
    cdp?.close();
    const chromeStopped = await stopChrome();
    if (chromeUserDataDir && chromeStopped) {
      removeDirectory(chromeUserDataDir);
    } else if (chromeUserDataDir) {
      console.warn(`Chrome did not exit; temporary directory was preserved: ${chromeUserDataDir}`);
    }
    await viteServer?.close();
  }
}

await main();
process.exit(process.exitCode ?? 0);
