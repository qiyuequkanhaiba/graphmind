import { checkArchitectureBudgets, formatArchitectureReport } from "./source-architecture.mjs";

const { failures, metrics } = checkArchitectureBudgets();

if (failures.length > 0) {
  console.error(`Source lint failed: ${failures.length} issue(s).`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Source lint passed: ${formatArchitectureReport(metrics)}`);
}
