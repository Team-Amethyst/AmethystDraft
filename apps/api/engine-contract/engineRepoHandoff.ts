/**
 * Parallel work for the Amethyst Engine repository (not in this monorepo).
 * Canonical JSON Schema (copy into the engine repo): ../schemas/valuation-request.v1.schema.json
 */
export const AMETHYST_ENGINE_REPO_CHECKLIST: readonly string[] = [
  "POST /valuation/calculate: accept flat body (no wrapper). Draft sends finalizeEngineValuationPostPayload(): drafted_players = auction picks only; pre_draft_rosters optional (keepers); both schema_version and schemaVersion when version set; optional player_ids, minors, taxi, deterministic, seed; budget_by_team_id; scoring_format; hitter_budget_pct; pos_eligibility_threshold.",
  "Validate request bodies against valuation-request.v1.schema.json (or generated OpenAPI) and return 400 with { errors: [{ field, message }] } on failure.",
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
  "Engine 400 validation uses { errors: [...] }; Draft error handler forwards that body without AppError wrapping.",
];
