import { defineConfig } from "vitest/config";

/** Keep Playwright files (`e2e/*.spec.ts`) out of Vitest — they run via `pnpm test:e2e`. */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
