# Changelog

## 1.0.0 — 2026-10-30

### Added

- Bots-only `server-track` with `client_ip` / `country`, `source: 'cf_worker'`, visitor `User-Agent`, `X-Tracking-Key`
- `_spyd_sid` SameSite=Lax 30-minute rolling session cookie shared with `wfm.js`
- `HTMLRewriter` injection of preconnect + `wfm.js` without double-inject
- Fire-and-forget track with 1.5s abort; failures never break the page
- Optional `EXCLUDED_PATH_PATTERNS` for pass-through paths (`/api/*`, `/admin*`, …)
- Vitest + workerd integration tests (`@cloudflare/vitest-pool-workers`)
- `npm run drift-check` against the generated snippet fixture
- Deploy to Cloudflare button, `.dev.vars.example`, and GitHub Actions CI

### Changed

- Default ingest URL: `https://api.spyderbot.net/server-track`
- Version bump to `1.0.0`
- `TRACKING_KEY` is a Worker secret (not a committed `[vars]` value)

## 0.1.0 — 2026-06-25

- Initial MVP Worker (track-all HTML + string `<head>` inject)
