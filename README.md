# SpyderBot Cloudflare Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/spyderbotlabs/spb-cloudflare-worker)

Public Cloudflare Worker for SpyderBot **AI Traffic / LLM tracking** at the edge: bots are recorded server-side; humans are owned by `wfm.js`.

**v1.0.0** — released on [GitHub](https://github.com/spyderbotlabs/spb-cloudflare-worker). License: [MIT](LICENSE).

## What it does

| Concern | Behaviour |
|--------|-----------|
| Server-track | **Bots only** (`isBotUa`), `GET`/`HEAD` + HTML, fire-and-forget `POST` with ≤1.5s abort |
| Ingest URL | `API_URL` (default `https://api.spyderbot.net/server-track`) |
| Auth | Header `X-Tracking-Key: <project tracking_key>` |
| Body | `url`, `referrer`, `session_id`, `client_ip`, `country`, `method`, `status_code`, `utm_*`, `source: 'cf_worker'` |
| IP / country | `cf-connecting-ip` / `x-forwarded-for`, `request.cf.country` / `cf-ipcountry` |
| Humans | No server POST — `HTMLRewriter` injects `wfm.js` (+ preconnect) once |
| Double-inject | Skips inject when a `script[src]` already contains `wfm.js` / `tracking.js` / `spyder.min.js` / `@spyderbot/spyder` |
| Session | `_spyd_sid` cookie, `SameSite=Lax`, 30-minute rolling TTL (shared with `wfm.js`) |
| Excludes | Optional `EXCLUDED_PATH_PATTERNS` — pass-through, no cookie / inject / track |
| Failures | Tracking errors never break the origin response |

## Deploy to Cloudflare (recommended)

1. Click **Deploy to Cloudflare** above (or open [deploy.workers.cloudflare.com](https://deploy.workers.cloudflare.com/?url=https://github.com/spyderbotlabs/spb-cloudflare-worker)).
2. When prompted for the **`TRACKING_KEY` secret**, paste your SpyderBot AI Traffic project tracking key (AI Traffic → website → Setup).
3. After deploy, attach a **route** that covers HTML pages (avoid `cdn-cgi` and static asset-only paths).
4. If your site has a Content-Security-Policy, allow `script-src` and `connect-src` for `https://spyderbot.net` (and your tracking API origin, default `https://api.spyderbot.net`).

## Wrangler deploy

```bash
npm ci
cp .dev.vars.example .dev.vars   # local only; put your real key there
npx wrangler secret put TRACKING_KEY
# optional: edit [vars] in wrangler.toml (API_URL, SCRIPT_ORIGIN, SCRIPT_VERSION, EXCLUDED_PATH_PATTERNS)
npx wrangler deploy
```

Example excludes:

```toml
EXCLUDED_PATH_PATTERNS = "/api/*,/admin*,/dashboard*,*auth*,*webhook*,/build/*,/storage/*"
```

## Required vars / secrets

| Binding | Required | How | Description |
|---------|----------|-----|-------------|
| `TRACKING_KEY` | **yes** | **Worker secret** | AI Traffic project ingest key |
| `API_URL` | no | `[vars]` | Full server-track URL (default prod API) |
| `API_ORIGIN` | no | `[vars]` | Deprecated; origin only → `/server-track` appended |
| `SCRIPT_ORIGIN` | no | `[vars]` | Origin for `wfm.js` (default `https://spyderbot.net`) |
| `SCRIPT_VERSION` | no | `[vars]` | `wfm.js` cache-bust query (`v=`) |
| `SPYDER_SCRIPT_URL` | no | `[vars]` | Full script URL override |
| `EXCLUDED_PATH_PATTERNS` | no | `[vars]` | Comma-separated path globs |

## Routes

Attach the Worker to hostname routes that prefer HTML document responses. Skip pure static/CDN paths where possible so bots and pages still hit the Worker while asset noise stays low.

## CSP

Allow SpyderBot script + API origins, for example:

- `script-src` … `https://spyderbot.net`
- `connect-src` … `https://spyderbot.net` `https://api.spyderbot.net`

Adjust if you override `SCRIPT_ORIGIN` / `API_URL`.

## Cloudflare Logpush (separate from this Worker)

This Worker does **not** configure Logpush. To import CDN access logs into SpyderBot:

1. Create a Cloudflare Logpush job with an **HTTP** destination.
2. Destination URL: `https://api.spyderbot.net/api/logpush` (or your SpyderBot app origin + `/api/logpush`).
3. Auth header: `X-Tracking-Key: <project tracking key>` (same key family as the Worker secret).
4. Logpush availability depends on your Cloudflare plan — check [Cloudflare Logpush docs](https://developers.cloudflare.com/logs/logpush/) / your plan features.

Gzip NDJSON payloads are accepted by SpyderBot when Log import is enabled on that environment.

## Paste-ready snippet (alternative)

```bash
npm ci
npm run generate -- --key=YOUR_TRACKING_KEY
# → dist/worker.generated.js — paste into Cloudflare Dashboard → Workers → Create
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm test` | Vitest + workerd (`@cloudflare/vitest-pool-workers`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run generate` | Paste-ready single-file Worker |
| `npm run drift-check` | Compare generated snippet ↔ app fixture (semantic) |
| `npm run deploy` | `wrangler deploy` |

## License

MIT — see [LICENSE](LICENSE).
