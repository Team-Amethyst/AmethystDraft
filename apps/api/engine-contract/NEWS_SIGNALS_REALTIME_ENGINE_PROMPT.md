# News signals realtime — Engine ↔ Draft alignment

## Status

**Draft (this repo)** ships Socket.IO + singleton poll + **`POST /api/internal/news-signals/hook`**.  
**Engine (AmethystAPI)** ships conditional **`GET /signals/news`** (ETag / `If-None-Match` / 304) + ingest webhook — implementation described by Engine team below.

---

## Engine implementation summary (reference)

### 1. Conditional GET — ETag + 304

- **Validator:** SHA-256 hex of **canonical JSON** for `{ count, signals }` only (`fetched_at` excluded so the tag is stable).
- **Headers:** `ETag: "<64-char-hex>"` on **200** and **304**.
- **`If-None-Match`:** Parsed as quoted / unquoted and weak (`W/"..."`) (see Engine `signalsHttp` / `ifNoneMatchIsCurrent`).
- **Fast path:** Redis sidecar `${signalsCacheKey}:http-etag` (TTL ≥ 24h while payload cache stays ~15m) can answer **304** without calling `fetchSignals` when the validator matches.
- **Second chance:** After `fetchSignals`, if computed fingerprint matches `If-None-Match`, respond **304** (no JSON body).

### 2. Ingest → Draft BFF webhook

After a cold MLB fetch, Engine compares the new fingerprint to the previous value in Redis; **if it changed**, it **POSTs** to **`DRAFT_NEWS_SIGNALS_WEBHOOK_URL`**:

```json
{ "event": "signals_updated", "occurred_at": "<ISO8601>" }
```

Header: **`Authorization: Bearer …`** — Draft accepts **`INTERNAL_WEBHOOK_SECRET`** if set, otherwise **`AMETHYST_API_KEY`** (same key Draft already uses for Engine HTTP). Engine can send Bearer **`AMETHYST_API_KEY`** with no extra Draft env.

If the URL is set but the secret is missing, Engine logs a warning and does not send. Failures are logged only; they do not fail the signals response.

### 3. Engine env

| Engine env | Purpose |
|------------|---------|
| **`DRAFT_NEWS_SIGNALS_WEBHOOK_URL`** | Full URL, e.g. `https://<draft-api-host>/api/internal/news-signals/hook` |
| **`INTERNAL_WEBHOOK_SECRET`** or reuse **`AMETHYST_API_KEY`** | Bearer token value Engine sends — must match what Draft validates (see above). |

**Last-Modified** was not added (optional).

---

## Draft behaviour (this repo)

| Draft piece | Behaviour |
|-------------|-----------|
| **`apps/api/src/realtime/newsSignalsPoller.ts`** | Polls Engine **`GET /signals/news`** (7-day window). Sends **`If-None-Match`** from last **`ETag`** when present; treats **304** as unchanged (no Socket.IO emit). |
| **`POST /api/internal/news-signals/hook`** | Validates **`Authorization: Bearer`** vs **`INTERNAL_WEBHOOK_SECRET`** or **`AMETHYST_API_KEY`**, then **`forcePollFromWebhook()`**. Returns **503** only if neither env is set (Draft normally always has **`AMETHYST_API_KEY`**). |
| **Browsers** | Socket.IO event **`news_signals_updated`** when the poller detects a snapshot change (after **200** with new body). |

---

## Coordination checklist

1. **Bearer token:** Easiest path — Engine sends **`Authorization: Bearer <AMETHYST_API_KEY>`** (same value Draft already sends to Engine as **`x-api-key`**). Optional: use a dedicated **`INTERNAL_WEBHOOK_SECRET`** on both sides instead.
2. **Webhook URL:** Engine **`DRAFT_NEWS_SIGNALS_WEBHOOK_URL`** = full Draft URL **`https://<host>/api/internal/news-signals/hook`** (must reach the Draft API over HTTPS in prod).
3. **IP allowlisting:** If Draft sits behind a WAF / API gateway, allow Engine egress IPs (or use a private link / tunnel). Optional; depends on hosting.
4. **Multi-instance Draft API:** Socket.IO fan-out across replicas still requires **Redis** (pub/sub or adapter) — not automatic with multiple tasks yet.

---

## Original ask (historical)

Draft originally requested ETag/304 + webhook so singleton polls stay cheap and ingest can trigger instant fan-out. The contract above matches that intent.
