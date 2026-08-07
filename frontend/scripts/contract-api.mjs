import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");
const backendContractScript = resolve(repoRoot, "backend/scripts/export_openapi_contract.py");
const pythonExecutable = resolveBackendPythonExecutable();

const result = spawnSync(pythonExecutable, [backendContractScript, "--check"], {
  cwd: repoRoot,
  env: process.env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function resolveBackendPythonExecutable() {
  const fileCandidates = [process.env.GRAPHMIND_BACKEND_PYTHON, resolve(repoRoot, "backend/.venv/bin/python")].filter(Boolean);
  for (const candidate of fileCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const commandCandidates = [process.env.PYTHON, "python3", "python"].filter(Boolean);
  for (const candidate of commandCandidates) {
    const probe = spawnSync(candidate, ["--version"], {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to find a Python executable with backend dependencies. " +
      "Set GRAPHMIND_BACKEND_PYTHON or install backend dependencies."
  );
}
