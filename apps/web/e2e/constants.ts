/** Must match `stub-api.ts` and `global-setup.ts` / Playwright web preview port. */
export const E2E_STUB_PORT = 3099;
export const E2E_PREVIEW_PORT = 4173;
export const E2E_API_ORIGIN = `http://127.0.0.1:${E2E_STUB_PORT}`;
export const E2E_PREVIEW_ORIGIN = `http://127.0.0.1:${E2E_PREVIEW_PORT}`;

export const E2E_JWT_SECRET = "playwright-e2e-jwt-secret-do-not-use-prod";
export const E2E_INTERNAL_API_KEY = "playwright-e2e-internal-key-do-not-use-prod";
export const E2E_USER_ID = "507f1f77bcf86cd799439011";
