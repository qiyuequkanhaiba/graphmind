import { checkArchitectureBudgets, formatArchitectureReport } from "./source-architecture.mjs";

const { failures, metrics } = checkArchitectureBudgets();

console.log(`Architecture audit report: ${formatArchitectureReport(metrics)}`);

if (failures.length > 0) {
  console.error(`Architecture audit failed: ${failures.length} budget issue(s).`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Architecture audit passed.");
}
