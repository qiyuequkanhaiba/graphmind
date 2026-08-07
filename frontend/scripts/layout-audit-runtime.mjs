import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME_START_ATTEMPTS = 2;
export const WORKBENCH_NAVIGATION_ATTEMPTS = 2;

export async function launchChrome({
  chromePath = findChromeExecutable(),
  createUserDataDir = (prefix) => mkdtempSync(join(tmpdir(), prefix)),
  profilePrefix,
  removeUserDataDir = removeDirectory,
  spawnChrome = spawnChromeProcess,
  startAttempts = CHROME_START_ATTEMPTS,
  startupTimeoutMs = 30000,
  stopChrome = stopProcess
}) {
  const failures = [];

  for (let attempt = 1; attempt <= startAttempts; attempt += 1) {
    const userDataDir = createUserDataDir(profilePrefix);
    const args = createChromeArgs(userDataDir);
    const chrome = spawnChrome(chromePath, args);

    try {
      const chromeEndpoint = await waitForChromeDevTools(chrome, startupTimeoutMs);
      return { chrome, chromeEndpoint, userDataDir };
    } catch (error) {
      const stopped = await stopChrome(chrome);
      const profileRemoved = stopped ? removeUserDataDir(userDataDir) : false;
      failures.push({
        attempt,
        error: error instanceof Error ? error.message : String(error),
        chromeStopped: stopped,
        profileRemoved
      });
      if (!stopped) {
        break;
      }
      if (attempt < startAttempts) {
        console.warn(`Chrome startup retry: attempt=${attempt}`);
      }
    }
  }

  throw new Error(
    `Chrome failed to expose its DevTools endpoint after ${failures.length} attempt(s): ${JSON.stringify(failures)}`
  );
}

export function createChromeArgs(userDataDir) {
  return [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    "--window-size=1440,900",
    "about:blank"
  ];
}

export function findChromeExecutable() {
  const explicitPath = process.env.CHROME_PATH;
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const macCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  ];
  const foundMacPath = macCandidates.find((candidate) => existsSync(candidate));
  if (foundMacPath) {
    return foundMacPath;
  }

  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  throw new Error("Chrome or Chromium was not found. Set CHROME_PATH to run browser checks.");
}

export function removeDirectory(path) {
  try {
    rmSync(path, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 120
    });
    return true;
  } catch (error) {
    console.warn(`Could not remove temporary directory ${path}: ${error.message}`);
    return false;
  }
}

export async function navigateToWorkbench({
  appUrl,
  cdp,
  collectDiagnostics,
  getConsoleIssues,
  sessionId,
  state,
  viewport,
  wait,
  waitForWorkbench
}) {
  const failures = [];
  let lastError;

  for (let attempt = 1; attempt <= WORKBENCH_NAVIGATION_ATTEMPTS; attempt += 1) {
    let phase = "navigate";
    try {
      const navigationResult = await cdp.send("Page.navigate", { url: appUrl }, sessionId);
      if (navigationResult?.errorText) {
        throw new Error(`Page.navigate failed: ${navigationResult.errorText}`);
      }
      phase = "workbench";
      await waitForWorkbench(cdp, sessionId);
      return;
    } catch (error) {
      lastError = error;
      const diagnostics = await collectDiagnostics().catch(() => unavailableDiagnostics());
      const consoleIssues = getConsoleIssues();
      failures.push({
        attempt,
        consoleIssueCount: consoleIssues.length,
        consoleIssues: consoleIssues.slice(0, 5).map(({ level, source, text }) => ({
          level,
          source,
          text
        })),
        diagnostics,
        error: error instanceof Error ? error.message : String(error),
        phase
      });

      if (phase === "workbench" && diagnostics.workbenchReady) {
        await wait(220);
        return;
      }

      const loadedAppWithoutWorkbench =
        phase === "workbench" &&
        diagnostics.readyState === "complete" &&
        diagnostics.rootPresent &&
        sameUrl(diagnostics.url, appUrl);
      const retryable =
        phase === "navigate" || (!loadedAppWithoutWorkbench && consoleIssues.length === 0);

      if (attempt === WORKBENCH_NAVIGATION_ATTEMPTS || !retryable) {
        break;
      }

      console.warn(
        `Layout audit navigation retry: viewport=${viewport.name} state=${state.name} attempt=${attempt} phase=${phase}`
      );
      await cdp.send("Page.stopLoading", {}, sessionId).catch((recoveryError) => {
        failures.at(-1).stopLoadingError = formatError(recoveryError);
      });
      await cdp.send("Page.navigate", { url: "about:blank" }, sessionId).catch((recoveryError) => {
        failures.at(-1).blankNavigationError = formatError(recoveryError);
      });
      await wait(250);
    }
  }

  throw new Error(
    `Timed out waiting for workbench: viewport=${viewport.name} state=${state.name} ` +
      `attempts=${failures.length} failures=${JSON.stringify(failures)}`,
    { cause: lastError }
  );
}

export async function stopProcess(
  childProcess,
  { forceTimeoutMs = 3000, gracefulTimeoutMs = 3000 } = {}
) {
  if (!childProcess || hasExited(childProcess)) {
    return true;
  }

  const gracefulExit = waitForExit(childProcess, gracefulTimeoutMs);
  childProcess.kill();
  if (await gracefulExit) {
    return true;
  }

  const forcedExit = waitForExit(childProcess, forceTimeoutMs);
  childProcess.kill("SIGKILL");
  return forcedExit;
}

function spawnChromeProcess(chromePath, args) {
  return spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
}

function waitForChromeDevTools(chrome, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = "";
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.off("error", onError);
      chrome.off("exit", onExit);
      chrome.stderr.off("data", onStderr);
      callback(value);
    };
    const onError = (error) => {
      finish(reject, new Error(`Chrome process failed to start: ${error.message}\n${stderr}`));
    };
    const onExit = (code, signal) => {
      finish(
        reject,
        new Error(
          `Chrome exited before DevTools became available. Exit code: ${code} Signal: ${signal}\n${stderr}`
        )
      );
    };
    const onStderr = (chunk) => {
      stderr = (stderr + String(chunk)).slice(-12000);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        finish(resolve, match[1]);
      }
    };
    const timeout = setTimeout(() => {
      finish(
        reject,
        new Error(`Timed out waiting for Chrome DevTools endpoint after ${timeoutMs}ms.\n${stderr}`)
      );
    }, timeoutMs);

    chrome.once("error", onError);
    chrome.once("exit", onExit);
    chrome.stderr.on("data", onStderr);
  });
}

function waitForExit(childProcess, timeoutMs) {
  if (hasExited(childProcess)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      childProcess.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(hasExited(childProcess)), timeoutMs);

    childProcess.once("exit", onExit);
    if (hasExited(childProcess)) {
      finish(true);
    }
  });
}

function hasExited(childProcess) {
  return childProcess.exitCode !== null || childProcess.signalCode !== null;
}

function unavailableDiagnostics() {
  return {
    bodyText: "",
    readyState: "unavailable",
    rootPresent: false,
    url: "unavailable",
    workbenchReady: false
  };
}

function sameUrl(actual, expected) {
  try {
    return new URL(actual).href === new URL(expected).href;
  } catch {
    return false;
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
