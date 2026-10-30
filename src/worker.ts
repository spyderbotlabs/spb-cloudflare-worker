import { isBotUa } from './bot';
import type { WorkerEnv } from './config';
import { injectWfmScript } from './inject';
import { isExcludedPath, looksLikeAsset } from './paths';
import {
  resolveExcludedPatterns,
  resolveScriptOrigin,
  resolveSpyderScriptUrl,
} from './resolve';
import { getOrCreateSessionId, withSessionHeaders } from './session';
import { postServerTrack } from './track';

export type { WorkerEnv } from './config';
export { isBotUa } from './bot';
export { looksLikeAsset, isExcludedPath, pathMatchesGlob, parseExcludedPatterns } from './paths';
export {
  resolveApiUrl,
  resolveScriptOrigin,
  resolveSpyderScriptUrl,
  resolveExcludedPatterns,
} from './resolve';
export { getOrCreateSessionId, parseCookies, sessionSetCookie } from './session';
export { buildServerTrackPayload, clientIp, clientCountry, postServerTrack } from './track';
export { scriptLooksTracked, buildInjectTags, injectWfmScript } from './inject';

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
  fetchOrigin: typeof fetch = fetch,
): Promise<Response> {
  if (!env.TRACKING_KEY) {
    return fetchOrigin(request);
  }

  const method = (request.method || 'GET').toUpperCase();
  const excluded = resolveExcludedPatterns(env);

  // Excluded paths: untouched (no cookie, no inject, no track).
  if (isExcludedPath(request.url, excluded)) {
    return fetchOrigin(request);
  }

  const sid = getOrCreateSessionId(request);
  const ua = request.headers.get('user-agent') || '';
  const bot = isBotUa(ua);

  // Fast-path: skip non-HTML work for obvious static assets
  if (looksLikeAsset(request.url) && method !== 'HEAD') {
    const assetResp = await fetchOrigin(request);
    return withSessionHeaders(assetResp, sid, false);
  }

  const response = await fetchOrigin(request);
  const contentType = response.headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html');
  const status = response.status;

  // Server-track ONLY bots / AI agents (humans → wfm.js). Record real status/method.
  // Bots: track GET/HEAD HTML (incl. 3xx/4xx/5xx). Skip POST and non-HTML.
  if (bot && isHtml && (method === 'GET' || method === 'HEAD')) {
    ctx.waitUntil(
      postServerTrack(request, env, sid, status, method, fetchOrigin).catch(() => undefined),
    );
  }

  // Inject wfm.js only on successful GET HTML pageviews
  if (!isHtml || method !== 'GET' || status < 200 || status >= 300) {
    return withSessionHeaders(response, sid, false);
  }

  const scriptOrigin = resolveScriptOrigin(env);
  const scriptUrl = resolveSpyderScriptUrl(env, env.TRACKING_KEY);
  const transformed = injectWfmScript(response, scriptOrigin, scriptUrl);
  return withSessionHeaders(transformed, sid, true);
}

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch {
      // Tracking / transform failures must never break the origin response.
      try {
        return await fetch(request);
      } catch {
        return new Response('Bad Gateway', { status: 502 });
      }
    }
  },
};

export default worker;
