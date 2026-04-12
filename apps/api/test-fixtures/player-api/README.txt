Player API / Activity #9 fixtures (valuation-request v1.0.0)
=============================================================

- league.base.json: reusable league block; merge into checkpoint payloads when generating from Excel.
- checkpoints/*.json: full valuation-request documents (schema apps/api/schemas/valuation-request.v1.schema.json).

POST /api/players/valuations with header x-player-api-key: <PLAYER_API_TEST_KEY>
Body: nested checkpoint JSON (this folder) OR flat Engine body (roster_slots, scoring_categories, total_budget, league_scope, drafted_players at top level; schema_version and/or schemaVersion).

Draft forwards to Engine with both schema_version and schemaVersion when a version is present. Engine 400 responses use { errors: [{ field, message }] }; the Draft error handler passes that through unchanged.

Generate from sample workbook:
  pnpm --filter api run fixtures:from-xlsx -- path/to/sample.xlsx test-fixtures/player-api

player_id values use MLB Stats API person ids as strings (sample data uses placeholders until the workbook is converted).
