# Draft valuation API contract (BFF → web/mobile)

The **Amethyst Draft BFF** (`apps/api`) does not pass through raw Engine JSON for valuation endpoints. All product responses are shaped by **`shapeValuationResponseForDraft`** in `apps/api/src/lib/draftValuationContract.ts`.

## Debug / detail

- Query flags: `?debug=1` or `?detail=1` (see `parseDraftValuationDebugQuery`).
- When enabled, the response includes **`diagnostics.engine_response`**: a full snapshot of the raw Engine JSON for that call (lossless round-trip for debugging).

Default traffic must not rely on diagnostics.

## Envelope (default)

| Field | Notes |
|-------|--------|
| `calculated_at` | ISO timestamp; unified name (Engine may send `calculatedAt`). |
| `model_version` | Model id string; accepts historical Engine keys and normalizes here. |
| `valuations` | Array of player rows (see below). |
| `inflation_factor`, `inflation_model`, `inflation_index_vs_opening_auction` | Macro inflation signals when Engine sends them. |
| `total_budget_remaining`, `players_remaining` | When present. |
| `user_team_id_used` | Active team context. |
| `draftable_player_ids`, `draftable_pool_size` | Pool mechanics. |
| `valuation_context`, `market_notes`, `valuation_context_warnings` | When Engine sends them. |
| `context_v2` | **Slim:** `market_summary` + `position_alerts` only (no assumptions/confidence/scope). |
| `scoring_category_warnings` | **Deduped** union of envelope + per-row `valuation_explain` warnings; row-level duplicates stripped when this array is non-empty. |
| `player` | Optional single-player row (same shape as valuation entries). |

**Not included in default responses:** `debug_v2`, `inflation_raw`, `inflation_bounded_by`, mechanical duplication of inflation percent at top level when the UI reads **`context_v2.market_summary.inflation_percent_vs_auction_open`**, and other Engine-only diagnostics (those appear under `diagnostics.engine_response` when debug is on).

## Per-player row (default)

| Field | Semantics |
|-------|-----------|
| `player_id`, `name`, `position`, `team` | Identity / display. |
| `baseline_value` | Strength before auction discounting. |
| `auction_value` | **League-wide** fair market auction value (mapped from Engine `adjusted_value` / `auction_value`). |
| `team_value` | Value **to the requesting team** — Engine **`team_adjusted_value`**, or **`auction_value`** when that field is omitted (same dollar minuend Engine uses for `edge`). |
| `recommended_bid` | Suggested bid; **`≤ max_bid`** after BFF clamp if numeric drift slips past the ceiling (should be rare). |
| `max_bid` | Team-specific hard cap. |
| `edge` | **`team_value − recommended_bid`** with the outbound suggested bid above (finite when both inputs are finite; else falls back to Engine `edge`). |
| Ranks / tiers | `baseline_rank`, `auction_rank`, `baseline_tier`, `auction_tier`, `tier`, `catalog_*`, `market_adp*` as applicable. |
| `indicator` | Steal / Reach / Fair Value. |
| `why`, `explain_v2`, `valuation_explain` | Explainability; scoring category warnings may be stripped from `valuation_explain` when hoisted to the envelope. |

Legacy names **`adjusted_value`** and **`team_adjusted_value`** are **not** present on shaped responses.

## Watchlist persistence

MongoDB watchlist entries still store **`adjustedValue`** / **`teamAdjustedValue`**. The BFF maps public JSON **`auction_value`** / **`team_value`** ↔ those fields on read/write.

## Size

Contract tests compare `JSON.stringify` byte length before/after shaping on a representative sample (`draftValuationContract.test.ts`); expect a smaller default payload than raw Engine output.
