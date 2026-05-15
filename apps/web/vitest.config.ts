import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Keep Playwright files (`e2e/*.spec.ts`) out of Vitest — they run via `pnpm test:e2e`. */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    environment: "jsdom",
  },
});
