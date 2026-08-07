import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");
const ignoredRoots = new Set(["backend/.venv", "frontend/node_modules"]);

const args = new Set(process.argv.slice(2));
const shouldClean = args.has("--clean");

const generatedPaths = collectGeneratedPaths(repoRoot).sort((left, right) => left.localeCompare(right));

if (shouldClean) {
  for (const path of generatedPaths.slice().reverse()) {
    rmSync(resolve(repoRoot, path), { force: true, recursive: true });
  }
  console.log(
    `Artifact hygiene report: cleaned ${generatedPaths.length} generated item(s).`
  );
  console.log(
    JSON.stringify(
      {
        action: "clean",
        removedCount: generatedPaths.length,
        removedPaths: generatedPaths
      },
      null,
      2
    )
  );
} else {
  console.log(
    `Artifact hygiene report: found ${generatedPaths.length} generated item(s).`
  );
  console.log(
    JSON.stringify(
      {
        action: "check",
        generatedCount: generatedPaths.length,
        generatedPaths
      },
      null,
      2
    )
  );
  if (generatedPaths.length > 0) {
    console.error(
      `Artifact hygiene check failed: remove ${generatedPaths.length} generated item(s).`
    );
    process.exitCode = 1;
  } else {
    console.log("Artifact hygiene check passed.");
  }
}

function collectGeneratedPaths(root) {
  const generated = [];

  function walk(currentPath) {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = join(currentPath, entry.name);
      const relativePath = relative(root, absolutePath);
      if (ignoredRoots.has(relativePath.split("/").slice(0, 2).join("/"))) {
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".venv") {
          continue;
        }
        if (
          entry.name === "__pycache__" ||
          entry.name === ".pytest_cache" ||
          entry.name === "dist" ||
          entry.name.startsWith("tmp-")
        ) {
          generated.push(relativePath);
          continue;
        }
        walk(absolutePath);
      } else if (entry.isFile() && entry.name.startsWith("tmp-")) {
        generated.push(relativePath);
      }
    }
  }

  walk(root);
  return generated;
}
