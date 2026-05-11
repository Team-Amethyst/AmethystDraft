/**
 * Playwright webServer entry: `vite build` (E2E API URL), stub API, then `vite preview`.
 * Keeps both processes until SIGTERM (Playwright teardown).
 *
 * Build runs here — not only in globalSetup — because Playwright starts webServer
 * before globalSetup, so `vite preview` would otherwise see no `dist/` on CI.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

/** Must match `E2E_API_ORIGIN` in `e2e/constants.ts`. */
const E2E_API_ORIGIN = "http://127.0.0.1:3099";

function runE2eViteBuild() {
  const r = spawnSync("pnpm", ["exec", "vite", "build"], {
    cwd: webRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL?.trim() || E2E_API_ORIGIN,
    },
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runE2eViteBuild();

async function waitForHealth(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`E2E: ${url} did not become ready`);
}

const stub = spawn("pnpm", ["exec", "tsx", "e2e/stub-api.ts"], {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});

try {
  await waitForHealth("http://127.0.0.1:3099/api/health");
} catch (e) {
  stub.kill("SIGTERM");
  throw e;
}

const preview = spawn(
  "pnpm",
  ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  { cwd: webRoot, stdio: "inherit", env: process.env },
);

function shutdown() {
  stub.kill("SIGTERM");
  preview.kill("SIGTERM");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

preview.on("exit", () => {
  stub.kill("SIGTERM");
});

stub.on("exit", (code, sig) => {
  if (sig !== "SIGTERM" && code !== 0 && code !== null) {
    preview.kill("SIGTERM");
    process.exit(code ?? 1);
  }
});

await new Promise((resolve, reject) => {
  preview.on("exit", resolve);
  preview.on("error", reject);
});
