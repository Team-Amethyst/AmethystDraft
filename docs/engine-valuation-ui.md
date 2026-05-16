# Engine valuation UI (AmethystDraft)

This document is a **product-facing summary** of how AmethystDraft should present Engine dollar outputs. The canonical definitions and mediation rules live in **AmethystAPI (Engine)**.

## Canonical spec

- **Valuation dollar ladder (full table and semantics):**  
  [Team-Amethyst/AmethystAPI — `docs/valuation-dollar-ladder.md`](https://github.com/Team-Amethyst/AmethystAPI/blob/main/docs/valuation-dollar-ladder.md)

Related Engine docs (integration, licensing, agent brief):

- [`docs/amethystdraft-engine-integration.md`](https://github.com/Team-Amethyst/AmethystAPI/blob/main/docs/amethystdraft-engine-integration.md)
- [`docs/draft-kit-license-runbook.md`](https://github.com/Team-Amethyst/AmethystAPI/blob/main/docs/draft-kit-license-runbook.md)
- [`ENGINE_AGENT_BRIEF.md`](https://github.com/Team-Amethyst/AmethystAPI/blob/main/ENGINE_AGENT_BRIEF.md)

## Mental model: dollar ladder

Processing order (each step may refine the previous):

| Step | Draft-facing field | Role in UI (summary) |
|------|----------------------|----------------------|
| 1 | `baseline_value` | Neutral / catalog-style strength before live draft context. |
| 2 | `auction_value` | League-wide fair market auction value (“fair list”); Engine may still emit `adjusted_value` internally. |
| 3 | `recommended_bid` | Suggested bid for your team (capped by `max_bid` from Engine) — **live draft** anchor. |
| 4 | `team_value` | Value **to your team** (roster and budget) — **roster-fit** headline. |
| 5 | `max_bid` | Hard spending stop for your team on this player. |
| 6 | `edge` | `team_value − recommended_bid` (recomputed at the BFF boundary when both are present). |

## One headline per surface

Do **not** mix multiple ladder steps as the same headline number. Pick **one** primary field per screen or card; use secondary lines, tooltips, or an expander for the rest.

| Surface | Primary headline | Supporting lines (typical) |
|---------|-------------------|----------------------------|
| Live draft / auction room | `recommended_bid` | `team_value`, `max_bid`, `edge`, optional `auction_value` |
| Transparency / list context | `auction_value` | `baseline_value`, `recommended_bid` |
| Roster fit / “what he’s worth to me” | `team_value` | `recommended_bid`, `edge`, `max_bid` |

Default table sort in draft-oriented views should anchor on **`recommended_bid`** unless the screen is explicitly a transparency or roster-fit lens.

## Trust copy

When present, prefer Engine explainability for trust copy:

- `explain_v2` — structured drivers and adjustments.
- `why` — short human-readable bullets.
- Response-level `context_v2` — league market narrative (e.g. Command Center inflation card).

## Engine portal vs AmethystDraft

The **Engine admin / portal UI** is **not** the rubric for how **AmethystDraft** labels or prioritizes dollars. Product copy and “primary by surface” rules in this repo follow the ladder doc above and our BFF-mediated integration — not a literal match to every Engine dashboard widget.

## Architecture reminder

Browser **must not** call Engine with `x-api-key` or embed Engine origins for valuation. All Engine traffic goes **server-side** through `apps/api` (BFF). See `.env.example` in `apps/api` for `AMETHYST_API_BASE_URL` and `AMETHYST_API_KEY` (server-only; never `VITE_*` or web public env).

## Mediation audit (AmethystDraft repo)

Run from the **repository root** after changes that touch the web client or env. Expect **no matches** in `apps/web` (except this doc if you copy the patterns literally):

```bash
rg -n 'valuation/calculate|x-api-key|AMETHYST_API_KEY|amethystapi\.com|Team-Amethyst/AmethystAPI' apps/web \
  --glob '!**/node_modules/**'
```

Engine paths like `/valuation/calculate` belong in **`apps/api`** only. The SPA should call **`/api/engine/...`** on your Draftroom API host (`VITE_API_URL`).

## Player tiers (Research UI)

Three tier concepts appear in product copy (Engine fields are unchanged):

- **Auction tier** — Default grouping in Research when any player in the pool has `auction_tier`: tier by **current league auction value** after valuation.
- **Model tier** (`catalog_tier`) — **Catalog / preseason** value bucket (1–5). Shown as the main tier column only when auction tiers are not loaded yet, or when the user turns on **Model rank & tiers** in Research.
- **Strength tier** (`baseline_tier`) — Tier by **baseline player strength** before auction economics. It is **not** shown in the default Research table or Research player modal; it remains available in Command Center and other draft contexts where baseline metrics are surfaced.

When auction tiers exist for the pool but a specific row is still missing `auction_tier`, the UI badge falls back to model tier and uses the tooltip **“Model Tier fallback.”**
