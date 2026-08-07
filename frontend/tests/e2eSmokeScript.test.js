import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("E2E smoke script", () => {
  it("fails on browser issues and uses trusted CDP input events", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/e2e-smoke.mjs"), "utf8");

    expect(source).toContain('client.on("Log.entryAdded"');
    expect(source).toContain('client.on("Runtime.exceptionThrown"');
    expect(source).toContain('client.on("Runtime.consoleAPICalled"');
    expect(source).toContain('"Input.dispatchMouseEvent"');
    expect(source).toContain('"Input.insertText"');
    expect(source).toContain('"Input.dispatchKeyEvent"');
    expect(source).toContain('launchChrome({ profilePrefix: "graphmind-e2e-" })');
    expect(source).toContain("stopProcess(chrome)");
    expect(source).not.toContain("element.click()");
  });

  it("supports hosted-session login and reload coverage", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/e2e-smoke.mjs"), "utf8");

    expect(source).toContain("GRAPHMIND_E2E_USERNAME");
    expect(source).toContain("GRAPHMIND_E2E_PASSWORD");
    expect(source).toContain("loginThroughBrowser");
    expect(source).toContain('cdp.send("Page.reload"');
    expect(source).toContain("createViteServer(backendBaseUrl)");
    expect(source).toContain('"/api": normalizeBaseUrl(backendBaseUrl)');
  });
});
