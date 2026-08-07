import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const storageDir = join(repoRoot, ".tmp");
const storageFile = join(storageDir, "node-localstorage.json");
const vitestBin = join(repoRoot, "node_modules", "vitest", "vitest.mjs");

mkdirSync(storageDir, { recursive: true });

const result = spawnSync(
  process.execPath,
  [`--localstorage-file=${storageFile}`, vitestBin, "run", ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--localstorage-file=${storageFile}`
      ].filter(Boolean).join(" ")
    },
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
