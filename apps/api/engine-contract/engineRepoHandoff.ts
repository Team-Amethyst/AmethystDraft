/**
 * Parallel work for the Amethyst Engine API (not in this monorepo):
 * https://github.com/Team-Amethyst/AmethystAPI
 *
 * Narrative Draft ↔ Engine brief: https://github.com/Team-Amethyst/AmethystAPI/blob/main/ENGINE_AGENT_BRIEF.md
 *
 * Canonical JSON Schema (copy into the engine repo): ../schemas/valuation-request.v1.schema.json
 */

/** Draft BFF route (Express, under /api/engine) → Amethyst Engine path — keep in sync with routes/engine.ts. */
export const DRAFT_BFF_ENGINE_PATHS: readonly { bff: string; engine: string; method: "GET" | "POST" }[] = [
  { bff: "POST /api/engine/leagues/:leagueId/valuation", engine: "POST /valuation/calculate", method: "POST" },
  { bff: "POST /api/engine/leagues/:leagueId/valuation/player", engine: "POST /valuation/player", method: "POST" },
  { bff: "POST /api/engine/leagues/:leagueId/scarcity", engine: "POST /analysis/scarcity", method: "POST" },
  { bff: "POST /api/engine/leagues/:leagueId/mock-pick", engine: "POST /simulation/mock-pick", method: "POST" },
  { bff: "POST /api/engine/catalog/batch-values", engine: "POST /catalog/batch-values", method: "POST" },
  { bff: "GET /api/engine/signals/news", engine: "GET /signals/news", method: "GET" },
];

/**
 * News/injury signals: Engine implements ETag + If-None-Match (304), Redis-backed fast path,
 * and POST to Draft when the fingerprint changes. Draft exposes ingest hook + polls Engine from BFF.
 * See NEWS_SIGNALS_REALTIME_ENGINE_PROMPT.md (alignment doc, not a live prompt).
 */
export const ENGINE_NEWS_SIGNALS_WEBHOOK_DRAFT_PATH =
  "POST /api/internal/news-signals/hook (Bearer INTERNAL_WEBHOOK_SECRET | AMETHYST_API_KEY)";

export const AMETHYST_ENGINE_REPO_CHECKLIST: readonly string[] = [
  "POST /valuation/calculate: accept flat body (no wrapper). Draft sends finalizeEngineValuationPostPayload(): drafted_players = auction picks only; pre_draft_rosters optional (keepers); both schema_version and schemaVersion when version set; optional player_ids (response filter only), eligible_player_ids (narrows baseline/inflation), minors, taxi, deterministic, seed; budget_by_team_id; scoring_format; hitter_budget_pct; pos_eligibility_threshold. Default Research/CC path omits position_overrides and injury_overrides (Engine Mongo catalog); set DRAFTROOM_SYNC_CATALOG_ELIGIBILITY_TO_ENGINE=1 to push full Draftroom catalog envelope.",
  "Validate request bodies against valuation-request.v1.schema.json (or generated OpenAPI) and return 400 or 422 with { errors: [{ field, message }] } on failure (422 = output sanity per OpenAPI).",
  "Document player_id as MLB Stats API person id (string), matching Draft externalPlayerId.",
  "Honor deterministic + seed when present for reproducible Activity #9 grading.",
  "Version responses if needed (e.g. engine_schema_version) alongside Draft schemaVersion 1.0.0.",
  "Add integration tests using JSON files from AmethystDraft apps/api/test-fixtures/player-api/checkpoints/.",
  "Echo X-Request-Id on Engine responses when Draft forwards it (Draft BFF propagates the header back to browsers/graders on success).",
];

/** Operational notes — not a guarantee of correctness; controls and limits. */
export const DRAFT_VALUATION_RELIABILITY_NOTES: readonly string[] = [
  "No universal 'bulletproof' claim: valuations depend on Engine availability, Mongo consistency, and MLB data freshness for catalog routes.",
  "Draft assigns X-Request-Id (or honors inbound) and forwards it to Engine on every amethyst call; logs include requestId when present.",
  "Engine timeout default 15s (override AMETHYST_ENGINE_TIMEOUT_MS). POST /valuation/calculate is not retried automatically to avoid duplicate heavy work.",
  "Engine 400 and 422 validation/output errors use { errors: [...] }; Draft error handler forwards those bodies without AppError wrapping.",
];
