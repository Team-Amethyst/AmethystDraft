/**
 * Parallel work for the Amethyst Engine repository (not in this monorepo).
 * Canonical JSON Schema (copy into the engine repo): ../schemas/valuation-request.v1.schema.json
 */
export const AMETHYST_ENGINE_REPO_CHECKLIST: readonly string[] = [
  "Expose or extend POST /valuation/calculate to accept the Draft API payload: drafted_players with optional positions[], is_keeper, roster_slot, pick_number; budget_by_team_id; scoring_format; hitter_budget_pct; pos_eligibility_threshold; schema_version; checkpoint; optional minors, taxi, deterministic, seed.",
  "Validate request bodies against valuation-request.v1.schema.json (or generated OpenAPI) and return 400 with { errors: [{ field, message }] } on failure.",
  "Document player_id as MLB Stats API person id (string), matching Draft externalPlayerId.",
  "Honor deterministic + seed when present for reproducible Activity #9 grading.",
  "Version responses if needed (e.g. engine_schema_version) alongside Draft schemaVersion 1.0.0.",
  "Add integration tests using JSON files from AmethystDraft apps/api/test-fixtures/player-api/checkpoints/.",
];
