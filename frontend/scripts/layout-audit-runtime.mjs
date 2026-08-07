export const WORKBENCH_NAVIGATION_ATTEMPTS = 2;

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
