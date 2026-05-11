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

## Troubleshooting

### `405 Method Not Allowed` on `draftroom.uk`

**Nothing is missing in Express for this route.** `POST /api/internal/news-signals/hook` is registered ([`routes/internal.ts`](../src/routes/internal.ts)). What’s missing is a **hostname that reaches App Runner**.

This repo’s deploy pipeline ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)) does **two separate things**:

1. **Static site** → S3 (`draftroom.uk` / `www` in DNS — marketing domain / SPA).
2. **API** → App Runner (`amethyst-api-prod` — distinct HTTPS hostname).

There is **no** CloudFront/API Gateway/nginx layer **in this repo** that maps **`draftroom.uk/api/*`** to App Runner. So **`https://draftroom.uk/.../api/...`** is **not** your Express server; it hits whatever serves the SPA (often **S3 website + Cloudflare**). Those stacks commonly respond with **`405`**, **`403`**, or **`404`** for **`POST`** to arbitrary paths — **not** `401`/`204` from Draft.

**Fix (no infra change):** Point **`DRAFT_NEWS_SIGNALS_WEBHOOK_URL`** at the **App Runner** URL (same host as GitHub **`VITE_API_URL`**):

`https://<your-apprunner-host>/api/internal/news-signals/hook`

**Fix (same-domain API later):** Add a reverse proxy (e.g. CloudFront behaviors: default → S3, `/api/*` and `/socket.io/*` → App Runner origin).

---

### Same webhook on the **correct** API host

Correct webhook URL shape:

`https://<API-host-from-VITE_API_URL>/api/internal/news-signals/hook`

Requirements:

- **`POST`** (only `POST` is registered on this path).
- **`Authorization: Bearer &lt;AMETHYST_API_KEY&gt;`** or **`Bearer &lt;INTERNAL_WEBHOOK_SECRET&gt;`** — exact match, single space after `Bearer`.

Sanity check (replace host and token):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://<API_HOST>/api/internal/news-signals/hook" \
  -H "Authorization: Bearer <same_value_as_Draft_AMETHYST_API_KEY>"
```

Expect **`204`**. **`401`** = wrong Bearer. **`503`** = Draft missing both `AMETHYST_API_KEY` and `INTERNAL_WEBHOOK_SECRET`. **`GET`** the hook URL on App Runner typically falls through to **404** (`ROUTE_NOT_FOUND`), not the webhook handler.

**`405` on `draftroom.uk`** → wrong host (SPA / CDN), not a missing Draft route or Bearer on App Runner.

### Still no in-app toast after webhook **204**?

1. **Browser must hold an active Socket.IO session.** Check while logged in with a tab open:
   ```bash
   curl -sS -H "Authorization: Bearer <AMETHYST_API_KEY>" \
     "https://<API_HOST>/api/internal/news-signals/debug"
   ```
   **`socketIoConnections`** should be **≥ 1**. If **0**, the SPA is not connecting (wrong **`VITE_API_URL`** in the built bundle, blocked WebSocket, or not signed in).

2. **Engine portal “Test webhook”** only fires the Sonner ping when the body includes **`"event": "custom"`**. Live **`signals_updated`** pushes refresh the list only when the Engine snapshot **fingerprint changes**.

3. **Behavior fix:** Socket.IO used to connect only inside **`/leagues/:id/*`**. It now connects for **any authenticated** session, and the **Intelligence Alerts** bell shows whenever the user is signed in (not only when a league context is loaded).

### `401 Unauthorized` on App Runner (correct host)

Draft compares the incoming token to **`INTERNAL_WEBHOOK_SECRET` first** if that env is set on the API service; **otherwise** it uses **`AMETHYST_API_KEY`**.

So:

1. If Draft App Runner has **`INTERNAL_WEBHOOK_SECRET`** set, the Engine portal’s **Dedicated Bearer** must be **exactly that string** — sending **`AMETHYST_API_KEY` alone will 401**.
2. If you intend to use **only** the API key, **clear `INTERNAL_WEBHOOK_SECRET`** on Draft App Runner (remove the env var or empty it), then set Engine’s Bearer to **the same value as Draft’s `AMETHYST_API_KEY`**.
3. After changing env on App Runner, **redeploy** or wait for the service to pick up new configuration.

Draft also accepts the same token in **`x-api-key`** (useful if a client cannot send `Authorization: Bearer`).

---

## Original ask (historical)

Draft originally requested ETag/304 + webhook so singleton polls stay cheap and ingest can trigger instant fan-out. The contract above matches that intent.
