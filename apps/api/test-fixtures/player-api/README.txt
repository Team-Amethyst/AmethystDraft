Player API / Activity #9 fixtures (valuation-request v1.0.0)
=============================================================

- league.base.json: reusable league block; merge into checkpoint payloads when generating from Excel.
- checkpoints/*.json: full valuation-request documents (schema apps/api/schemas/valuation-request.v1.schema.json).

POST /api/players/valuations with header x-player-api-key: <PLAYER_API_TEST_KEY>
Body: any checkpoint JSON file.

Generate from sample workbook:
  pnpm --filter api run fixtures:from-xlsx -- path/to/sample.xlsx test-fixtures/player-api

player_id values use MLB Stats API person ids as strings (sample data uses placeholders until the workbook is converted).
