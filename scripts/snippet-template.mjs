/**
 * Paste-ready Worker source template.
 * Keep behaviour aligned with src/worker.ts and the app's
 * CloudflareWorkerSnippetBuilder / cloudflare-worker-snippet.ts.
 *
 * Intentional deltas vs current app generator (tracked by drift-check):
 * - AbortController timeout (1500ms) on server-track
 * - utm_* fields extracted from the request URL
 * - optional EXCLUDED_PATH_PATTERNS is wrangler-only (not in paste snippet)
 */

export function buildPasteSnippet({
  trackingKey = 'YOUR_TRACKING_KEY',
  serverTrackUrl = 'https://api.spyderbot.net/server-track',
  scriptOrigin = 'https://spyderbot.net',
  scriptVersion = '1.1.1',
} = {}) {
  const scriptUrl = `${scriptOrigin}/wfm.js?key=${trackingKey}&v=${scriptVersion}`;

  return `// SpyderBot Cloudflare Worker — paste in Cloudflare Dashboard → Workers → Create
// Recommended routes (exclude static assets):
//   *yourdomain.com/
//   *yourdomain.com/*.html
//   *yourdomain.com/blog/*
// Avoid: *yourdomain.com/cdn-cgi/* , *yourdomain.com/assets/* , *yourdomain.com/*.css|js|png|…
// CSP: allow script-src + connect-src for ${scriptOrigin} and the tracking API origin used below.
// Session cookie: _spyd_sid (SameSite=Lax, 30-min rolling) — shared with wfm.js when present.
// Source: https://github.com/spyderbotlabs/spb-cloudflare-worker

const TRACKING_KEY = '${trackingKey}';
const SERVER_TRACK_URL = '${serverTrackUrl}';
const SPYDER_SCRIPT_URL = '${scriptUrl}';
const SPYDER_SCRIPT_URL_ORIGIN = '${scriptOrigin}';
const SESSION_COOKIE = '_spyd_sid';
const SESSION_TTL_SEC = 30 * 60;
const TRACK_TIMEOUT_MS = 1500;

const BOT_UA_RE = /gptbot|chatgpt|claudebot|anthropic|perplexity|google-extended|bingbot|googlebot|bytespider|petalbot|amazonbot|applebot|duckduckbot|yandexbot|baiduspider|semrushbot|ahrefsbot|facebookexternalhit|twitterbot|linkedinbot|slurp|ccbot|diffbot|ia_archiver|\\bbot\\b|crawler|spider|scraper/i;

function isBotUa(ua) {
  return BOT_UA_RE.test(ua || '');
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getOrCreateSessionId(request) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const existing = cookies[SESSION_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) {
    return existing;
  }
  return 'cf_' + crypto.randomUUID().replace(/-/g, '');
}

function sessionSetCookie(sid) {
  return SESSION_COOKIE + '=' + encodeURIComponent(sid)
    + '; Path=/; Max-Age=' + SESSION_TTL_SEC
    + '; SameSite=Lax';
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '';
}

function clientCountry(request) {
  const fromCf = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '';
  return String(fromCf).toUpperCase();
}

function looksLikeAsset(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\\.(css|js|mjs|map|jpg|jpeg|gif|png|ico|svg|webp|avif|woff2?|ttf|eot|mp4|webm|mp3|pdf|zip|gz|xml|txt|json)$/.test(path);
  } catch (_) {
    return false;
  }
}

function extractUtm(url) {
  try {
    const u = new URL(url);
    return {
      utm_source: u.searchParams.get('utm_source') || '',
      utm_medium: u.searchParams.get('utm_medium') || '',
      utm_campaign: u.searchParams.get('utm_campaign') || '',
    };
  } catch (_) {
    return { utm_source: '', utm_medium: '', utm_campaign: '' };
  }
}

async function postServerTrack(request, sid, status, method) {
  const ua = request.headers.get('user-agent') || '';
  const ip = clientIp(request);
  const country = clientCountry(request);
  const utm = extractUtm(request.url);
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, TRACK_TIMEOUT_MS);
  try {
    await fetch(SERVER_TRACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tracking-Key': TRACKING_KEY,
        'User-Agent': ua,
      },
      body: JSON.stringify({
        url: request.url,
        referrer: request.headers.get('referer') || '',
        session_id: sid,
        client_ip: ip,
        country: country,
        status_code: status,
        method: method,
        source: 'cf_worker',
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function withSessionHeaders(response, sid, stripValidators) {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', sessionSetCookie(sid));
  if (stripValidators) {
    headers.delete('content-length');
    headers.delete('etag');
    headers.delete('last-modified');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const method = (request.method || 'GET').toUpperCase();
    const sid = getOrCreateSessionId(request);
    const ua = request.headers.get('user-agent') || '';
    const bot = isBotUa(ua);

    // Fast-path: skip non-HTML work for obvious static assets
    if (looksLikeAsset(request.url) && method !== 'HEAD') {
      const assetResp = await fetch(request);
      return withSessionHeaders(assetResp, sid, false);
    }

    const response = await fetch(request);
    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');
    const status = response.status;

    // Server-track ONLY bots / AI agents (humans → wfm.js). Record real status/method.
    // Bots: track GET/HEAD HTML (incl. 3xx/4xx/5xx). Skip POST and non-HTML.
    if (bot && isHtml && (method === 'GET' || method === 'HEAD')) {
      ctx.waitUntil(postServerTrack(request, sid, status, method).catch(() => {}));
    }

    // Inject wfm.js only on successful GET HTML pageviews
    if (!isHtml || method !== 'GET' || status < 200 || status >= 300) {
      return withSessionHeaders(response, sid, false);
    }

    let alreadyTagged = false;
    const preconnectTag = '<link rel="preconnect" href="' + SPYDER_SCRIPT_URL_ORIGIN + '" crossorigin>';
    const scriptTag = '<script async src="' + SPYDER_SCRIPT_URL + '"><\\/script>';

    const rewriter = new HTMLRewriter()
      .on('script[src]', {
        element(el) {
          const src = (el.getAttribute('src') || '').toLowerCase();
          if (
            src.includes('wfm.js')
            || src.includes('tracking.js')
            || src.includes('spyder.min.js')
            || src.includes('@spyderbot/spyder')
          ) {
            alreadyTagged = true;
          }
        },
      })
      .on('head', {
        element(el) {
          el.onEndTag((endTag) => {
            if (!alreadyTagged) {
              endTag.before(preconnectTag + scriptTag, { html: true });
            }
          });
        },
      });

    const transformed = rewriter.transform(response);
    return withSessionHeaders(transformed, sid, true);
  },
};
`;
}
