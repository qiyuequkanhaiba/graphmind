import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "..");
const workflowPath = resolve(repoRoot, ".github/workflows/productization-gates.yml");
const acceptancePlanPath = resolve(repoRoot, "docs/productization-acceptance-plan.md");
const checklistPath = resolve(repoRoot, "docs/productization-release-checklist.md");
const roadmapPath = resolve(repoRoot, "docs/productization-roadmap.md");

describe("P3 release gates", () => {
  it("defines CI gates for backend, frontend, layout, and quality verification", () => {
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("backend-gates");
    expect(workflow).toContain("frontend-gates");
    expect(workflow).toContain("dependency-review");
    expect(workflow).toContain("astral-sh/setup-uv");
    expect(workflow).toContain("uv sync --frozen --extra dev");
    expect(workflow).toContain("pytest -q");
    expect(workflow).toContain("pytest tests/test_url_import_phase_60.py -q");
    expect(workflow).toContain("pytest tests/test_deployment_security_phase_p4.py -q");
    expect(workflow).toContain("pytest tests/test_auth_guardrails_phase_p4.py -q");
    expect(workflow).toContain("pytest tests/test_import_worker_mode_phase_p4.py -q");
    expect(workflow).toContain("pytest tests/test_review_analytics_maintenance.py -q");
    expect(workflow).toContain("pytest tests/test_tls_ingress_phase_p4.py -q");
    expect(workflow).toContain("ruff check graphmind tests");
    expect(workflow).toContain("pytest --cov=graphmind --cov-report=term-missing --cov-fail-under=70 -q");
    expect(workflow).toContain("python scripts/export_openapi_contract.py --check");
    expect(workflow).toContain("deploy/graphmind-ops.py preflight");
    expect(workflow).toContain("--workspace-root /tmp/graphmind-preflight-workspace");
    expect(workflow).toContain("docker compose -f deploy/docker-compose.yml");
    expect(workflow).toContain("docker-compose.tls.yml");
    expect(workflow).toContain("GRAPHMIND_SERVICE_ENV_FILE: /tmp/graphmind-ci.env");
    expect(workflow).toContain("tmp-deployment-gates");
    expect(workflow).toContain("deployment-gates");
    expect(workflow).toContain("deployment-preflight.json");
    expect(workflow).toContain("set -o pipefail");
    expect(workflow).toContain("shell: bash");
    expect(workflow).toContain("compose-config.json");
    expect(workflow).toContain("compose-tls-config.json");
    expect(workflow).toContain("Verify deployment gate artifacts");
    expect(workflow).toContain("preflight.status !== \"ready\"");
    expect(workflow).toContain('requireServices("compose-config.json", ["backend", "frontend", "worker"])');
    expect(workflow).toContain('requireServices("compose-tls-config.json", ["backend", "frontend", "worker", "caddy"])');
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run lint:source");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run contract:api");
    expect(workflow).toContain("npm run test:e2e");
    expect(workflow).toContain("npm run audit:architecture");
    expect(workflow).toContain("npm run clean:artifacts -- --check");
    expect(workflow).toContain("npm run audit:layout");
    expect(workflow).toContain("npm run audit:quality");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("actions/dependency-review-action");
    expect(workflow).toContain("fail-on-severity: high");
    expect(workflow).toContain("tmp-layout-audit-auto");
    expect(workflow).toContain("frontend/dist");
  });

  it("documents release sign-off commands and artifact expectations", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf8");

    expect(checklist).toContain("Backend behavior");
    expect(checklist).toContain("Frontend layout audit");
    expect(checklist).toContain("Quality budget");
    expect(checklist).toContain("URL import safety");
    expect(checklist).toContain("Dependency review");
    expect(checklist).toContain("frontend animation, 3D, and import-related packages");
    expect(checklist).toContain("Layout audit artifacts");
    expect(checklist).toContain("Deployment gate artifacts");
    expect(checklist).toContain("deployment-preflight.json");
    expect(checklist).toContain("compose-config.json");
    expect(checklist).toContain("compose-tls-config.json");
    expect(checklist).toContain("pip-audit==2.9.0");
    expect(checklist).toContain("status: \"ready\"");
    expect(checklist).toContain("backend`, `frontend`, and `worker");
    expect(checklist).toContain("caddy");
    expect(checklist).toContain("Closed Non-Blocking Risks");
    expect(checklist).toContain("Remaining Deferred Scope");
    expect(checklist).toContain("P11 Professional Engineering Baseline");
    expect(checklist).toContain("OpenAPI contract");
    expect(checklist).toContain("E2E smoke");
    expect(checklist).toContain("Artifact hygiene");
  });

  it("keeps P10 release verification hardening documented in productization evidence", () => {
    expect(existsSync(acceptancePlanPath)).toBe(true);
    expect(existsSync(roadmapPath)).toBe(true);

    const acceptancePlan = readFileSync(acceptancePlanPath, "utf8");
    const checklist = readFileSync(checklistPath, "utf8");
    const roadmap = readFileSync(roadmapPath, "utf8");

    expect(roadmap).toContain("P0/P1/P2/P3/P4/P5/P6/P7/P8/P9/P10");
    expect(roadmap).toContain("P10 Release Verification Hardening");
    expect(roadmap).toContain("ChatPanel duplicate React key warnings");
    expect(roadmap).toContain("data-dialog");
    expect(roadmap).toContain("deployment-gates");
    expect(roadmap).toContain("Verify deployment gate artifacts");

    expect(acceptancePlan).toContain("P10 release verification hardening");
    expect(acceptancePlan).toContain("AC-62");
    expect(acceptancePlan).toContain("AC-63");
    expect(acceptancePlan).toContain("AC-64");
    expect(acceptancePlan).toContain("ChatPanel duplicate React key warnings");
    expect(acceptancePlan).toContain("deployment artifact integrity");
    expect(acceptancePlan).toContain("Docker is unavailable in this local workspace");
    expect(acceptancePlan).toContain("P10 release verification hardening verification passed");
    expect(acceptancePlan).toContain("deployment-gates CI job now provides runner-rendered Compose evidence");

    expect(checklist).toContain("P10 Release Verification Hardening");
    expect(checklist).toContain("duplicate React key");
    expect(checklist).toContain("missingStateTarget");
    expect(checklist).toContain("deployment artifact integrity");
  });

  it("keeps P11 professional engineering gates documented and executable", () => {
    const packageJson = readFileSync(resolve(repoRoot, "frontend/package.json"), "utf8");
    const checklist = readFileSync(checklistPath, "utf8");
    const roadmap = readFileSync(roadmapPath, "utf8");

    expect(existsSync(resolve(repoRoot, "frontend/scripts/lint-source.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "frontend/scripts/contract-api.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "frontend/scripts/e2e-smoke.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "frontend/scripts/audit-architecture.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "frontend/scripts/clean-artifacts.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "backend/scripts/export_openapi_contract.py"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "backend/tests/test_openapi_contract.py"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "backend/tests/test_observability_phase_p11.py"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "docs/api/openapi-contract-summary.json"))).toBe(true);

    expect(packageJson).toContain("\"lint:source\"");
    expect(packageJson).toContain("\"contract:api\"");
    expect(packageJson).toContain("\"test:e2e\"");
    expect(packageJson).toContain("\"audit:architecture\"");
    expect(packageJson).toContain("\"clean:artifacts\"");

    expect(roadmap).toContain("P11 Professional Engineering Baseline");
    expect(roadmap).toContain("coverage, OpenAPI contract, E2E smoke, architecture budget, observability, and artifact hygiene");
    expect(checklist).toContain("P11 Professional Engineering Baseline");
    expect(checklist).toContain("pytest --cov=graphmind");
    expect(checklist).toContain("npm run contract:api");
    expect(checklist).toContain("npm run test:e2e");
  });
});
