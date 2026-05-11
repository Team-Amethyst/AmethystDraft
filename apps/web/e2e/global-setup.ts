import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_API_ORIGIN } from "./constants.ts";

/**
 * Bake `VITE_API_URL` into the preview build so the SPA talks to the stub API.
 */
export default async function globalSetup(): Promise<void> {
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  execSync("pnpm exec vite build", {
    cwd: webRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_URL: E2E_API_ORIGIN,
    },
  });
}
