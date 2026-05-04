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

| Step | Engine field | Role in UI (summary) |
|------|----------------|----------------------|
| 1 | `baseline_value` | Neutral / catalog-style strength before live draft context. |
| 2 | `adjusted_value` | League + draft context (slots, replacement, pool) — **transparency / “fair list”** headline. |
| 3 | `recommended_bid` | Auction bid anchor / likely clearing — **live draft** headline. |
| 4 | `team_adjusted_value` | Personalized to **your** roster and budget — **roster-fit** headline. |
| 5 | `edge` | Value vs anchor (Engine-supplied or derived in UI when absent). |

## One headline per surface

Do **not** mix multiple ladder steps as the same headline number. Pick **one** primary field per screen or card; use secondary lines, tooltips, or an expander for the rest.

| Surface | Primary headline | Supporting lines (typical) |
|---------|-------------------|----------------------------|
| Live draft / auction room | `recommended_bid` | `team_adjusted_value`, `edge`, optional `adjusted_value` |
| Transparency / list context | `adjusted_value` | `baseline_value`, `recommended_bid` |
| Roster fit / “what he’s worth to me” | `team_adjusted_value` | `recommended_bid`, `edge` |

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
