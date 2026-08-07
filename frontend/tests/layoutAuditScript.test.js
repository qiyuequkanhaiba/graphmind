import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  navigateToWorkbench,
  stopProcess,
  WORKBENCH_NAVIGATION_ATTEMPTS
} from "../scripts/layout-audit-runtime.mjs";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
const auditScriptPath = resolve(process.cwd(), "scripts/audit-layout.mjs");
const qualityScriptPath = resolve(process.cwd(), "scripts/audit-quality.mjs");
const qualityBudgetsPath = resolve(process.cwd(), "quality-budgets.json");
const viteConfigPath = resolve(process.cwd(), "vite.config.ts");

describe("layout audit automation", () => {
  it("exposes a repeatable responsive layout audit command", () => {
    expect(packageJson.scripts["audit:layout"]).toBe("node scripts/audit-layout.mjs");
    expect(packageJson.scripts["audit:quality"]).toBe("node scripts/audit-quality.mjs");
  });

  it("keeps the browser layout audit broad enough for productized workbench regressions", () => {
    expect(existsSync(auditScriptPath)).toBe(true);

    const script = readFileSync(auditScriptPath, "utf8");

    expect(script).toContain("const VIEWPORTS =");
    expect(script).toContain("desktop");
    expect(script).toContain("tablet");
    expect(script).toContain("mobile");
    expect(script).toContain("compact-mobile");
    expect(script).toContain("graph-default");
    expect(script).toContain("light-theme");
    expect(script).toContain("switchLightTheme");
    expect(script).toContain(".workbench-theme-toggle");
    expect(script).toContain("graph-tools");
    expect(script).toContain("graph-analysis-drawer");
    expect(script).toContain("openGraphAnalysisDrawer");
    expect(script).toContain("search-open");
    expect(script).toContain("command-palette");
    expect(script).toContain("openCommandPalette");
    expect(script).toContain("data-dialog");
    expect(script).toContain("REQUIRED_STATE_SELECTORS");
    expect(script).toContain("openDataDialog: \".data-actions-dialog\"");
    expect(script).toContain("missingStateTarget");
    expect(script).toContain("collectRequiredStateTargetProblems");
    expect(script).toContain("ai-settings-dialog");
    expect(script).toContain("project-sharing-dialog");
    expect(script).toContain('openProjectSharingDialog: ".project-sharing-dialog"');
    expect(script).toContain(".workbench-header-action[aria-label='打开 AI 配置']");
    expect(script).toContain("insights-ai");
    expect(script).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(script).toContain("pageHorizontalOverflow");
    expect(script).toContain("chatMessagesTooSmall");
    expect(script).toContain("graphCanvasTooSmall");
    expect(script).toContain("dialogEscapeCloseFailed");
    expect(script).toContain("dialogInitialFocusMissing");
    expect(script).toContain("searchKeyboardNavigationFailed");
    expect(script).toContain("searchEscapeCloseFailed");
    expect(script).toContain("searchFocusRestoreFailed");
    expect(script).toContain("commandPaletteKeyboardNavigationFailed");
    expect(script).toContain("commandPaletteEscapeCloseFailed");
    expect(script).toContain("commandPaletteFocusRestoreFailed");
    expect(script).not.toContain("ALLOWED_CONSOLE_PATTERNS");
    expect(script).not.toContain("React Flow parent container needs a width and a height");
    expect(script).toContain("Runtime.consoleAPICalled");
    expect(script).toContain("Log.entryAdded");
    expect(script).toContain("unexpectedConsoleIssue");
    expect(script).toContain("consoleIssueCount");
    expect(script).toContain("allowedConsoleIssueCount");
    expect(script).toContain("unexpectedConsoleIssueCount");
    expect(script).toContain("navigateToWorkbench");
    expect(script).toContain("await stopChrome()");
    expect(script).toContain("temporary directory was preserved");
  });

  it("retries Page.navigate error responses with state diagnostics", async () => {
    const calls = [];
    let appNavigationCount = 0;
    const cdp = {
      async send(method, params) {
        calls.push([method, params]);
        if (method === "Page.navigate" && params.url === "http://127.0.0.1:5173/") {
          appNavigationCount += 1;
          if (appNavigationCount === 1) {
            return { errorText: "net::ERR_FAILED" };
          }
        }
        return {};
      }
    };

    await navigateToWorkbench({
      appUrl: "http://127.0.0.1:5173/",
      cdp,
      collectDiagnostics: async () => ({
        readyState: "complete",
        rootPresent: true,
        url: "http://127.0.0.1:5173/",
        workbenchReady: false
      }),
      getConsoleIssues: () => [],
      sessionId: "session",
      state: { name: "insights-ai" },
      viewport: { name: "tablet" },
      wait: async () => undefined,
      waitForWorkbench: async () => undefined
    });

    expect(WORKBENCH_NAVIGATION_ATTEMPTS).toBe(2);
    expect(appNavigationCount).toBe(2);
    expect(calls).toContainEqual(["Page.stopLoading", {}]);
    expect(calls).toContainEqual(["Page.navigate", { url: "about:blank" }]);
  });

  it("does not retry a fully loaded app document that fails to render the workbench", async () => {
    let appNavigationCount = 0;
    const cdp = {
      async send(method, params) {
        if (method === "Page.navigate" && params.url === "http://127.0.0.1:5173/") {
          appNavigationCount += 1;
        }
      }
    };

    await expect(
      navigateToWorkbench({
        appUrl: "http://127.0.0.1:5173/",
        cdp,
        collectDiagnostics: async () => ({
          bodyText: "Application failed",
          readyState: "complete",
          rootPresent: true,
          url: "http://127.0.0.1:5173/",
          workbenchReady: false
        }),
        getConsoleIssues: () => [],
        sessionId: "session",
        state: { name: "insights-ai" },
        viewport: { name: "tablet" },
        wait: async () => undefined,
        waitForWorkbench: async () => {
          throw new Error("workbench missing");
        }
      })
    ).rejects.toThrow(/viewport=tablet state=insights-ai.*workbench missing/);

    expect(appNavigationCount).toBe(1);
  });

  it("forces Chrome to exit before allowing its profile directory to be removed", async () => {
    const childProcess = new FakeChildProcess("SIGKILL");

    await expect(
      stopProcess(childProcess, { forceTimeoutMs: 20, gracefulTimeoutMs: 1 })
    ).resolves.toBe(true);

    expect(childProcess.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(childProcess.signalCode).toBe("SIGKILL");
  });

  it("reports when Chrome remains alive after forced termination", async () => {
    const childProcess = new FakeChildProcess(null);

    await expect(
      stopProcess(childProcess, { forceTimeoutMs: 1, gracefulTimeoutMs: 1 })
    ).resolves.toBe(false);

    expect(childProcess.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("exits after writing the layout audit report so CI cannot hang", () => {
    const script = readFileSync(auditScriptPath, "utf8");

    expect(script).toContain("await main();");
    expect(script).toContain("process.exit(process.exitCode ?? 0)");
  });

  it("defines CI-ready product quality budgets", () => {
    expect(existsSync(qualityScriptPath)).toBe(true);
    expect(existsSync(qualityBudgetsPath)).toBe(true);
    expect(existsSync(viteConfigPath)).toBe(true);

    const budgets = JSON.parse(readFileSync(qualityBudgetsPath, "utf8"));
    const script = readFileSync(qualityScriptPath, "utf8");
    const viteConfig = readFileSync(viteConfigPath, "utf8");

    expect(budgets.layout.maxProblems).toBe(0);
    expect(budgets.layout.minViewportStateChecks).toBeGreaterThanOrEqual(60);
    expect(budgets.visual.requiredStates).toEqual(
      expect.arrayContaining([
        "graph-default",
        "data-dialog",
        "ai-settings-dialog",
        "project-sharing-dialog"
      ])
    );
    expect(budgets.visual.requiredViewports).toEqual(
      expect.arrayContaining(["desktop", "mobile", "compact-mobile"])
    );
    expect(budgets.performance.maxInitialJsKb).toBeLessThanOrEqual(750);
    expect(budgets.performance.maxAsyncJsKb).toBeLessThanOrEqual(560);
    expect(budgets.performance.maxCssKb).toBeLessThanOrEqual(160);
    expect(budgets.performance.maxBuildWarnings).toBe(0);
    expect(budgets.performance.buildWarningChunkKb).toBeLessThanOrEqual(560);
    expect(viteConfig).toContain("manualChunks");
    expect(viteConfig).toContain("react-vendor");
    expect(viteConfig).toContain("graph-vendor");
    expect(script).toContain("quality-budgets.json");
    expect(script).toContain("GRAPHMIND_DIST_DIR");
    expect(script).toContain("layout-audit-summary.json");
    expect(script).toContain("maxInitialJsKb");
    expect(script).toContain("maxAsyncJsKb");
    expect(script).toContain("maxCssKb");
    expect(script).toContain("maxBuildWarnings");
    expect(script).toContain("Bundle metrics:");
    expect(script).toContain("largestAsyncJsKb");
    expect(script).toContain("cssKb");
    expect(script).toContain("buildWarningCount");
  });
});

class FakeChildProcess extends EventEmitter {
  exitCode = null;
  signalCode = null;
  signals = [];

  constructor(exitSignal) {
    super();
    this.exitSignal = exitSignal;
  }

  kill(signal = "SIGTERM") {
    this.signals.push(signal);
    if (signal === this.exitSignal) {
      this.signalCode = signal;
      queueMicrotask(() => this.emit("exit", null, signal));
    }
    return true;
  }
}
