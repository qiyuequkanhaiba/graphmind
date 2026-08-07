import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function runScript(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

describe("P11 professional engineering gates", () => {
  it("runs the source lint gate", () => {
    const result = runScript(["scripts/lint-source.mjs"]);
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Source lint passed");
  });

  it("runs the architecture audit gate", () => {
    const result = runScript(["scripts/audit-architecture.mjs"]);
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Architecture audit passed");
  });

  it("fails the hygiene gate when generated artifacts exist", () => {
    const generatedPath = resolve(process.cwd(), "../tmp-artifact-hygiene-test");
    mkdirSync(generatedPath, { recursive: true });
    try {
      const result = runScript(["scripts/clean-artifacts.mjs", "--check"]);
      expect(result.status).toBe(1);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("Artifact hygiene check failed");
      expect(output).toContain("tmp-artifact-hygiene-test");
    } finally {
      rmSync(generatedPath, { force: true, recursive: true });
    }
  });

  it("runs the OpenAPI contract export gate", () => {
    const result = runScript(["scripts/contract-api.mjs"]);
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("OpenAPI contract check passed");
  });
});
