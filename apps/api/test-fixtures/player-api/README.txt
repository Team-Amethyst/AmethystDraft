Player API / Activity #9 fixtures (valuation-request v1.0.0)
=============================================================

- league.base.json: reusable league block; merge into checkpoint payloads when generating from Excel (Draftroom standard roster; matches Mongo default when rosterSlots is omitted on POST /api/leagues).
- league.legacy-mongo-roster-fallback.json: pre-2026 Mongoose-only default (2 SP / 2 RP / 3 P / 5 BN, no MI/CI) kept for regression or Engine comparisons; not used by active checkpoints.
- checkpoints/*.json: full valuation-request documents (schema apps/api/schemas/valuation-request.v1.schema.json).

POST /api/players/valuations with header x-player-api-key: <PLAYER_API_TEST_KEY>
Body: nested checkpoint JSON (this folder) OR flat Engine body (roster_slots, scoring_categories, total_budget, league_scope, drafted_players at top level; schema_version and/or schemaVersion).

Draft forwards to Engine with both schema_version and schemaVersion when a version is present. Engine 400 responses use { errors: [{ field, message }] }; the Draft error handler passes that through unchanged.

Checkpoint filenames: JSON always uses "checkpoint": "after_pick_10", etc. Draft stores shorter disk names here (after_10.json …); AmethystAPI uses after_pick_10.json under test-fixtures/ and public/fixtures/checkpoints/. See ENGINE_AGENT_BRIEF.md mapping table. Optional drift script (sibling repo): node scripts/compare-engine-checkpoints.mjs ../AmethystAPI

Generate from the real course workbook (wide 2026 layout: Pre-Draft Roster + Draft with “Brought Up”, etc.):
  pnpm --filter api run fixtures:from-xlsx -- "/path/to/2026Draft.xlsx" test-fixtures/player-api

Optional (network; writes mlb-statsapi-40man-index.json for offline CI; allow tens of seconds):
  CHECKPOINT_ROSTER_STATS_SEASON=2025 node scripts/sample-draft-xlsx-to-fixtures.mjs --fetch-rosters "/path/to/2026Draft.xlsx" ./test-fixtures/player-api

Strict gate (exit 1 if any draft row with a Player name fails to resolve):
  pnpm --filter api run fixtures:from-xlsx -- "/path/to/2026Draft.xlsx" test-fixtures/player-api --strict

Refresh roster JSON only (no workbook required):
  pnpm --filter api run fixtures:refresh-rosters
  (optional: CHECKPOINT_ROSTER_STATS_SEASON=2025 — defaults to prior calendar year with a floor)

- mlb-statsapi-40man-index.json: schema checkpoint_mlb_40man_v2 — each row has player_id, name, MLB org abbreviation, StatsAPI roster `position.abbreviation` (`raw_position`), and pitchers get `fantasy_pitch` SP|RP inferred from hydrated season pitching splits (`season_used_for_pitch_roles` in the JSON). Wide fixtures merge this with workbook slots (`U→UTIL`, `P→SP/RP`) and emit canonical `positions` + `roster_slot` aligned to league.base.json slot keys.

- checkpoint-display-overrides.json: flat keys (except `draft_picks` / `extra_roster_entries`) are **keeper display** overrides (`player_id` + optional `reason`). `draft_picks` maps **pick #** (string) → `{ player_id, reason? }` when the sheet disagrees with the committed 40-man snapshot. `extra_roster_entries` lists `{ player_id, name, abbr, raw_position, fantasy_pitch? }` for players required by the workbook but absent from that snapshot.

Wide Pre-Draft Roster sheets may use **two (or more) header rows**: Team A–E in the top block and Team F–I in a lower block with the same 4-column roster layout (slot | player | contract | salary). The converter scans **every** row for `Team X $NNN` headers — not only row 0.

Minors and Taxi sheets use paired columns (slot | player) per team. They are written to checkpoint `minors` / `taxi` arrays (not auction roster slots). Unresolved names get deterministic `fixture_unresolved_*` ids and a warning line.

`league.team_names` carries workbook fantasy labels (Team A … Team I). Demo league import and Overview use these instead of Team 1 … Team 9. Refresh an existing demo league: `pnpm --filter api run demo:refresh-pre-draft`.

Final Roster is **validated only** (not embedded in checkpoints). Checkpoints = pre_draft_rosters + draft_state + minors + taxi.

After regeneration, validate:
  pnpm --filter api run fixtures:validate-summary -- test-fixtures/player-api/checkpoints/pre_draft.json

`pnpm fixtures:generate` is deprecated (exits non-zero); use `fixtures:from-xlsx` or `fixtures:refresh-rosters`. The old synthetic `scripts/generate-sample-checkpoints.mjs` harness was removed; Vitest exercises the wide path with `--strict` via `scripts/lib/sample-draft-xlsx-to-fixtures.integration.test.mjs` (minimal temp workbook + tiny 40-man JSON).

player_id values are MLB Stats API person IDs as strings.
