/** Defaults match SpyderBot production install snippets (who-follow-me tracking config). */

export const DEFAULT_API_URL = 'https://api.spyderbot.net/server-track';

export const DEFAULT_SCRIPT_ORIGIN = 'https://spyderbot.net';

export const DEFAULT_SCRIPT_VERSION = '1.1.1';

export const SESSION_COOKIE = '_spyd_sid';

export const SESSION_TTL_SEC = 30 * 60;

/** Fire-and-forget server-track timeout (shared ingest contract ≤1–1.5s). */
export const TRACK_TIMEOUT_MS = 1500;

export const INTEGRATION_SOURCE = 'cf_worker';

/**
 * Optional path excludes (comma-separated in env). When matched: pass-through,
 * no injection, no server-track. Empty by default so paste-ready snippet matches
 * the app generator; set via wrangler for production hardening.
 */
export const DEFAULT_EXCLUDED_PATH_PATTERNS: readonly string[] = [];

/** Example patterns documented for operators (not applied unless configured). */
export const EXAMPLE_EXCLUDED_PATH_PATTERNS = [
  '/api/*',
  '/admin*',
  '/dashboard*',
  '*auth*',
  '*webhook*',
  '/build/*',
  '/storage/*',
] as const;

export const BOT_UA_RE =
  /gptbot|chatgpt|claudebot|anthropic|perplexity|google-extended|bingbot|googlebot|bytespider|petalbot|amazonbot|applebot|duckduckbot|yandexbot|baiduspider|semrushbot|ahrefsbot|facebookexternalhit|twitterbot|linkedinbot|slurp|ccbot|diffbot|ia_archiver|\bbot\b|crawler|spider|scraper/i;

export const SCRIPT_SRC_MARKERS = [
  'wfm.js',
  'tracking.js',
  'spyder.min.js',
  '@spyderbot/spyder',
] as const;

export const ASSET_PATH_RE =
  /\.(css|js|mjs|map|jpg|jpeg|gif|png|ico|svg|webp|avif|woff2?|ttf|eot|mp4|webm|mp3|pdf|zip|gz|xml|txt|json)$/;

export type WorkerEnv = {
  TRACKING_KEY: string;
  /** Full server-track ingest URL (preferred). */
  API_URL?: string;
  /** @deprecated Prefer API_URL. Origin only; `/server-track` is appended. */
  API_ORIGIN?: string;
  SCRIPT_ORIGIN?: string;
  SCRIPT_VERSION?: string;
  SPYDER_SCRIPT_URL?: string;
  /** Comma-separated path globs (`*` = any run of chars). */
  EXCLUDED_PATH_PATTERNS?: string;
};
