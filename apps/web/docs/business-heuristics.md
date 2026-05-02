# Business heuristics and UI-only rules

This document describes **tunable thresholds**, **label-shortening rules**, and **search ranking** that are not enforced by the API. They exist to keep the draft room and research UI readable. When you change behavior here, update this file and any affected tests.

---

## Auction Center: value vs. bid “verdict” (`verdictFromValueMinusBid`)

Used for the identity badge tone (positive / negative / muted) and bid-decision card styling. It is based on **rounded dollars**: `round(your_value − recommended_bid)`.

| Condition | Effect |
|-----------|--------|
| `delta < -10` | Card tone **overpay** |
| `delta > 5` | Card tone **value** |
| Otherwise | Card tone **fair** |
| `delta < -15` | **danger** flag (strong overpay warning styling) |
| `delta > 10` | **strong** flag (strong value styling) |
| `delta > 2` | UI tone **pos**; `delta < -2` → **neg**; else **muted** |
| Label text | `delta > 0` → “Strong Value”; `delta < 0` → “Overpay”; else “Fair Price” |

These cutoffs are **product choices**, not engine outputs. For roster-wide bid guidance aligned with research tables, see `auctionBidDecision.ts` (`AUCTION_VALUE_DIFF_THRESHOLDS`, `playerValuationEdgeOrDiff`).

---

## Roto category labels (`impactLabelParts`)

Maps league **scoring category names** (as stored on the league) to **primary** (and optional **secondary**) labels for small “impact” tiles in Command Center / Auction Center.

- Normalizes synonyms (e.g. `"Walks + Hits per IP"` → WHIP, `"K"` → strikeouts / SO).
- Prefers a **short abbreviation** when the full name would overflow tile layout.
- Uses **string length heuristics** (e.g. full ≤ 22 chars → single line; otherwise abbrev + subtitle).
- Replaces words like “Percentage” → “Pct” for compact display.

If a league uses a custom category name not in the map, the function falls back to the raw name or a truncated slice—**review tiles** after adding exotic scoring.

---

## Auction player search (typeahead)

`searchRankedAvailablePlayers` ranks **undrafted** players whose names match the query.

| Score | Match rule |
|-------|------------|
| 0 | Full name starts with query |
| 1 | Any name token starts with query |
| 2 | Any token contains query |
| 3 | Full name contains query (substring) |

Ties break by **lower ADP** (better list rank). Results are capped (default 8). Minimum query length for listing is enforced by the caller.

---

## Engine row vs. catalog merge (`mergeDisplayValuationRow`)

When the per-player or board **valuation row** omits a finite number, the UI **fills from the catalog `Player`** for: `recommended_bid`, `team_adjusted_value`, `adjusted_value`, `baseline_value`. `edge` is only taken from the engine row when finite (no catalog fallback). This avoids blank tiles when the API is partial; it is **display-only**—persisted roster/engine state is unchanged.

---

## Dev-only diagnostics

`AuctionCenter` (and related code) may log structured snapshots in **`import.meta.env.DEV`** to trace valuation pipeline gaps (catalog vs. engine vs. merged row). These logs are **not** product behavior; remove or gate them if they become noisy.

---

## Research / roster value-diff signals (`auctionBidDecision.ts`)

`AUCTION_VALUE_DIFF_THRESHOLDS` and `auctionDecisionSignalFromValueDiff` drive **research table** and **roster-wide** bid guidance labels (e.g. “Aggressive target”, “Price sensitive”). Those dollar cutoffs are **not the same numbers** as `verdictFromValueMinusBid` above, which only powers the **Auction Center** identity badge and bid-decision card styling. Unifying the two models is optional future work; until then, treat both as documented UI heuristics.
