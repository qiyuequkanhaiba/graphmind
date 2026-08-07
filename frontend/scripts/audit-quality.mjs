import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");
const budgets = JSON.parse(
  readFileSync(resolve(frontendRoot, "quality-budgets.json"), "utf8")
);
const auditOutputDir = resolve(
  repoRoot,
  process.env.GRAPHMIND_AUDIT_OUTPUT_DIR ?? "tmp-layout-audit-auto"
);
const layoutSummaryPath = join(auditOutputDir, "layout-audit-summary.json");
const layoutReportPath = join(auditOutputDir, "layout-audit.json");
const distDir = resolve(process.env.GRAPHMIND_DIST_DIR ?? resolve(frontendRoot, "dist"));
const distIndexPath = resolve(distDir, "index.html");
const distAssetsDir = resolve(distDir, "assets");

const failures = [];
const metrics = {};

assertLayoutBudget();
assertVisualCoverage();
assertPerformanceBudget();

if (failures.length > 0) {
  printBundleMetrics();
  console.error(`Quality audit failed: ${failures.length} budget issue(s).`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  printBundleMetrics();
  console.log("Quality audit passed.");
}

function assertLayoutBudget() {
  if (!existsSync(layoutSummaryPath)) {
    failures.push(
      `Missing layout-audit-summary.json. Run npm run audit:layout before npm run audit:quality.`
    );
    return;
  }
  const summary = JSON.parse(readFileSync(layoutSummaryPath, "utf8"));
  if (summary.problemCount > budgets.layout.maxProblems) {
    failures.push(
      `Layout problems ${summary.problemCount} exceed budget ${budgets.layout.maxProblems}.`
    );
  }
  if (summary.resultCount < budgets.layout.minViewportStateChecks) {
    failures.push(
      `Layout checks ${summary.resultCount} below budget ${budgets.layout.minViewportStateChecks}.`
    );
  }
}

function assertVisualCoverage() {
  if (!existsSync(layoutReportPath)) {
    failures.push("Missing layout-audit.json for visual coverage checks.");
    return;
  }
  const report = JSON.parse(readFileSync(layoutReportPath, "utf8"));
  for (const state of budgets.visual.requiredStates) {
    if (!report.states?.includes(state)) {
      failures.push(`Visual coverage missing state: ${state}.`);
    }
  }
  const viewportNames = new Set((report.viewports ?? []).map((viewport) => viewport.name));
  for (const viewport of budgets.visual.requiredViewports) {
    if (!viewportNames.has(viewport)) {
      failures.push(`Visual coverage missing viewport: ${viewport}.`);
    }
  }
  const missingScreenshots = (report.results ?? []).filter(
    (result) => result.screenshotPath && !existsSync(result.screenshotPath)
  );
  if (missingScreenshots.length > 0) {
    failures.push(`Visual screenshots missing for ${missingScreenshots.length} checks.`);
  }
}

function assertPerformanceBudget() {
  if (!existsSync(distIndexPath) || !existsSync(distAssetsDir)) {
    failures.push("Missing dist output. Run npm run build before npm run audit:quality.");
    return;
  }
  const initialScripts = [...readFileSync(distIndexPath, "utf8").matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
    .map((match) => match[1])
    .filter((source) => !source.startsWith("http"));
  if (initialScripts.length === 0) {
    failures.push("No initial JS entrypoint found in dist/index.html.");
    return;
  }
  const initialScriptNames = new Set(initialScripts.map((source) => source.split("/").pop()));
  const assets = readdirSync(distAssetsDir)
    .filter((filename) => filename.endsWith(".js") || filename.endsWith(".css"))
    .map((filename) => {
      const size = statSync(resolve(distAssetsDir, filename)).size;
      return {
        filename,
        kb: Math.ceil(size / 1024),
        kind: filename.endsWith(".css") ? "css" : "js"
      };
    });
  const initialJsKb = assets
    .filter((asset) => asset.kind === "js" && initialScriptNames.has(asset.filename))
    .reduce((sum, asset) => sum + asset.kb, 0);
  const asyncJsAssets = assets.filter(
    (asset) => asset.kind === "js" && !initialScriptNames.has(asset.filename)
  );
  const largestAsyncJsKb = asyncJsAssets.reduce(
    (largest, asset) => Math.max(largest, asset.kb),
    0
  );
  const cssKb = assets
    .filter((asset) => asset.kind === "css")
    .reduce((sum, asset) => sum + asset.kb, 0);
  const buildWarningCount = assets.filter(
    (asset) => asset.kind === "js" && asset.kb > budgets.performance.buildWarningChunkKb
  ).length;

  metrics.initialJsKb = initialJsKb;
  metrics.largestAsyncJsKb = largestAsyncJsKb;
  metrics.cssKb = cssKb;
  metrics.buildWarningCount = buildWarningCount;

  if (initialJsKb > budgets.performance.maxInitialJsKb) {
    failures.push(
      `Initial JS ${initialJsKb} KB exceeds budget ${budgets.performance.maxInitialJsKb} KB.`
    );
  }
  if (largestAsyncJsKb > budgets.performance.maxAsyncJsKb) {
    failures.push(
      `Largest async JS ${largestAsyncJsKb} KB exceeds budget ${budgets.performance.maxAsyncJsKb} KB.`
    );
  }
  if (cssKb > budgets.performance.maxCssKb) {
    failures.push(`CSS ${cssKb} KB exceeds budget ${budgets.performance.maxCssKb} KB.`);
  }
  if (buildWarningCount > budgets.performance.maxBuildWarnings) {
    failures.push(
      `Build warning count ${buildWarningCount} exceeds budget ${budgets.performance.maxBuildWarnings}.`
    );
  }
}

function printBundleMetrics() {
  if (Object.keys(metrics).length === 0) {
    return;
  }
  console.log(
    [
      "Bundle metrics:",
      `initialJsKb=${metrics.initialJsKb}`,
      `largestAsyncJsKb=${metrics.largestAsyncJsKb}`,
      `cssKb=${metrics.cssKb}`,
      `buildWarningCount=${metrics.buildWarningCount}`
    ].join(" ")
  );
}
