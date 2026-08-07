import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");
const budgetPath = resolve(frontendRoot, "architecture-budgets.json");

export function collectArchitectureMetrics() {
  const config = loadArchitectureBudgets();
  return Object.entries(config.trackedFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, maxLines]) => {
      const absolutePath = resolve(repoRoot, relativePath);
      if (!exists(absolutePath)) {
        return {
          absolutePath,
          lineCount: 0,
          maxLines,
          missing: true,
          relativePath,
          usageRatio: 0
        };
      }
      const content = readFileSync(absolutePath, "utf8");
      const lineCount = content.split(/\r?\n/).length;
      return {
        absolutePath,
        lineCount,
        maxLines,
        missing: false,
        relativePath,
        usageRatio: lineCount / maxLines
      };
    });
}

export function checkArchitectureBudgets() {
  const metrics = collectArchitectureMetrics();
  const failures = metrics
    .flatMap((metric) => {
      if (metric.missing) {
        return [`${metric.relativePath} is missing from the repository.`];
      }
      if (metric.lineCount > metric.maxLines) {
        return [
          `${metric.relativePath} has ${metric.lineCount} lines and exceeds budget ${metric.maxLines}.`
        ];
      }
      return [];
    });
  return { failures, metrics };
}

export function formatArchitectureReport(metrics) {
  const sorted = [...metrics].sort((left, right) => right.lineCount - left.lineCount);
  const topEntries = sorted.slice(0, 5).map((metric) => {
    const usage = Math.round(metric.usageRatio * 100);
    return `${metric.relativePath}=${metric.lineCount}/${metric.maxLines} (${usage}%)`;
  });
  return topEntries.join(", ");
}

export function loadArchitectureBudgets() {
  return JSON.parse(readFileSync(budgetPath, "utf8"));
}

function exists(path) {
  return existsSync(path);
}
