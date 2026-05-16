# Engine checkpoint fixtures (2026 wide workbook)

Generated from `2026Draft.xlsx` via `node scripts/sample-draft-xlsx-to-fixtures.mjs`.

| Catalog id | File | `draft_state` picks |
|------------|------|---------------------|
| `pre_draft` | `pre_draft.json` | 0 |
| `after_pick_10` | `after_10.json` | 10 |
| `after_pick_50` | `after_50.json` | 50 |
| `after_pick_100` | `after_100.json` | 100 |
| `after_pick_130` | `after_130.json` | 130 |
| `finished_league` | `finished_league.json` | **133** (full Draft sheet) |

Each file also includes `pre_draft_rosters` (keepers), `minors`, and `taxi`. `league.budget_by_team_id` reflects keeper cost plus the auction picks in that checkpoint’s `draft_state` slice.

## Finished league source

`finished_league` is the **complete Draft sheet** (all parsed auction rows). The **Final Roster** sheet is validated at generation time only; it is **not** embedded as a separate roster source for checkpoints or Mongo import.

## Salary rules

- Auction rows in `draft_state` require a positive Salary from the workbook; blank cells are not coerced to `0` (strict generation fails; non-strict skips with `DRAFT_SALARY_MISSING`).
- Minors/taxi reserve rows use `price: 0` in Mongo and `MIN`/`TAXI` slots; they are excluded from auction spend and UI draft logs.

Validate: `node scripts/fixtures-validate-checkpoints.mjs`
