import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "..");
const workflowPath = resolve(repoRoot, ".github/workflows/productization-gates.yml");
const lockfilePath = resolve(repoRoot, "frontend/package-lock.json");
const composeFiles = [
  resolve(repoRoot, "deploy/docker-compose.yml"),
  resolve(repoRoot, "deploy/docker-compose.tls.yml"),
];
const dockerfiles = [
  resolve(repoRoot, "deploy/backend.Dockerfile"),
  resolve(repoRoot, "deploy/frontend.Dockerfile"),
];

describe("CI supply-chain hardening", () => {
  it("uses read-only defaults, a narrowly elevated dependency review, and bounded jobs", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toMatch(/permissions:\n  contents: read\n\njobs:/);
    expect(workflow).toMatch(
      /dependency-review:[\s\S]*?permissions:\n      contents: read\n      pull-requests: write/,
    );

    for (const job of [
      "dependency-review",
      "backend-gates",
      "deployment-gates",
      "frontend-gates",
      "supply-chain-gates",
      "smoke-gates",
    ]) {
      expect(workflow).toMatch(new RegExp(`${job}:[\\s\\S]*?timeout-minutes: \\d+`));
    }
  });

  it("pins every action to a reviewed immutable SHA and records its release tag", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const actionUses = [...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([0-9a-f]{40})\s*$/gm)];

    expect(actionUses.length).toBeGreaterThan(0);
    expect(workflow).not.toMatch(/^\s*uses:\s+[^@\s]+@v\d+/m);

    for (const actionUse of actionUses) {
      const precedingLines = workflow.slice(0, actionUse.index).split("\n").slice(-3).join("\n");
      expect(precedingLines).toMatch(/# v\d+\.\d+\.\d+/);
    }
  });

  it("pins Docker build inputs and uses only the canonical npm registry in the lockfile", () => {
    for (const dockerfile of dockerfiles) {
      const source = readFileSync(dockerfile, "utf8");
      const imageReferences = [...source.matchAll(/^FROM\s+([^\s]+)/gm)].map((match) => match[1]);

      expect(imageReferences.length).toBeGreaterThan(0);
      for (const imageReference of imageReferences) {
        expect(imageReference).toMatch(/@sha256:[0-9a-f]{64}$/);
      }
      const copySources = [...source.matchAll(/^COPY --from=([^\s]+)/gm)].map((match) => match[1]);
      for (const copySource of copySources) {
        if (/[/:]/.test(copySource)) {
          expect(copySource).toMatch(/@sha256:[0-9a-f]{64}$/);
        }
      }
    }

    for (const composeFile of composeFiles) {
      const source = readFileSync(composeFile, "utf8");
      const imageReferences = [...source.matchAll(/^\s+image:\s+([^\s]+)/gm)].map(
        (match) => match[1],
      );
      for (const imageReference of imageReferences) {
        expect(imageReference).toMatch(/@sha256:[0-9a-f]{64}$/);
      }
    }

    const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
    const packages = Object.values(lockfile.packages);

    expect(JSON.stringify(lockfile)).not.toContain("registry.npmmirror.com");
    for (const packageMetadata of packages) {
      if (packageMetadata?.resolved) {
        expect(packageMetadata.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//);
        expect(packageMetadata.integrity).toMatch(/^sha(?:256|384|512)-/);
      }
    }
  });

  it("audits the frozen production Python dependency graph on pushes and pull requests", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const supplyChainJob = workflow.slice(workflow.indexOf("  supply-chain-gates:"));

    expect(supplyChainJob).toContain("actions/setup-python@");
    expect(supplyChainJob).toContain("astral-sh/setup-uv@");
    expect(supplyChainJob).toContain("uv export --frozen --no-dev --no-emit-project --no-hashes");
    expect(supplyChainJob).toContain("uvx --from pip-audit==2.9.0 pip-audit");
    expect(supplyChainJob).toContain("--no-deps --disable-pip");
    expect(supplyChainJob).toContain("/tmp/graphmind-production-requirements.txt");
  });
});
