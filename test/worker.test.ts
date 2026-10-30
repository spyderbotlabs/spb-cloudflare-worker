import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker, { handleRequest, type WorkerEnv } from '../src/worker';

const ORIGIN = 'https://customer.example';
const TRACK_URL = 'https://api.spyderbot.net/server-track';

type TrackCall = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

function testEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    TRACKING_KEY: 'test_tracking_key_fixture',
    API_URL: TRACK_URL,
    SCRIPT_ORIGIN: 'https://spyderbot.net',
    SCRIPT_VERSION: '1.1.1',
    ...overrides,
  };
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const h = new Headers(headers);
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function mockFetch(options: {
  originBody?: string | Uint8Array;
  originStatus?: number;
  originContentType?: string;
  trackFail?: boolean;
  trackCalls: TrackCall[];
}): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith(TRACK_URL) || url.includes('/server-track')) {
      if (options.trackFail) {
        throw new Error('network down');
      }
      const headers = headerRecord(init?.headers);
      const raw = typeof init?.body === 'string' ? init.body : '';
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      options.trackCalls.push({ url, headers, body });
      return new Response('{"ok":true}', { status: 200 });
    }

    // Passthrough origin
    if (typeof input !== 'string' && !(input instanceof URL) && input instanceof Request) {
      // Prefer responding to the inbound request URL
    }
    return new Response(options.originBody ?? '', {
      status: options.originStatus ?? 200,
      headers: {
        'content-type': options.originContentType ?? 'text/html; charset=utf-8',
      },
    });
  };
}

describe('worker fetch behaviour', () => {
  it('bot UA → one POST with correct body/headers; sets cookie', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '<html><head><title>t</title></head><body>hi</body></html>',
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/?utm_source=ads`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0)',
        'cf-connecting-ip': '198.51.100.2',
        'cf-ipcountry': 'DE',
        referer: 'https://openai.com/',
      },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    expect(trackCalls).toHaveLength(1);
    expect(trackCalls[0].headers['x-tracking-key']).toBe('test_tracking_key_fixture');
    expect(trackCalls[0].headers['user-agent']).toContain('GPTBot');
    expect(trackCalls[0].body).toMatchObject({
      client_ip: '198.51.100.2',
      country: 'DE',
      method: 'GET',
      status_code: 200,
      source: 'cf_worker',
      referrer: 'https://openai.com/',
      utm_source: 'ads',
    });
    expect(String(trackCalls[0].body.session_id)).toMatch(/^cf_/);

    const setCookie = response.headers.get('set-cookie') || '';
    expect(setCookie).toContain('_spyd_sid=');
    expect(setCookie).toContain('SameSite=Lax');

    const out = await response.text();
    expect(out).toContain('wfm.js');
    expect(out).toContain('rel="preconnect"');
  });

  it('human → no POST; wfm.js injected once', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '<html><head></head><body>human</body></html>',
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/page`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    expect(trackCalls).toHaveLength(0);
    const out = await response.text();
    expect(out.match(/wfm\.js/g)?.length).toBe(1);
    expect(response.headers.get('set-cookie')).toContain('_spyd_sid=');
  });

  it('does not double-inject when page already contains wfm.js', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody:
        '<html><head><script src="https://spyderbot.net/wfm.js?key=x"></script></head><body>x</body></html>',
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/already`, {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    const out = await response.text();
    expect(out.match(/wfm\.js/g)?.length).toBe(1);
  });

  it('rolls existing _spyd_sid cookie', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '<html><head></head></html>',
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/sess`, {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        cookie: '_spyd_sid=ExistingSid9',
      },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get('set-cookie')).toContain('_spyd_sid=ExistingSid9');
  });

  it('excluded paths pass through untouched (no inject, no track)', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '<html><head></head><body>api</body></html>',
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/api/secret`, {
      headers: { 'user-agent': 'GPTBot/1.0' },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(
      request,
      testEnv({ EXCLUDED_PATH_PATTERNS: '/api/*,/admin*' }),
      ctx,
      fetchImpl,
    );
    await waitOnExecutionContext(ctx);

    expect(trackCalls).toHaveLength(0);
    expect(response.headers.get('set-cookie')).toBeNull();
    const out = await response.text();
    expect(out).toBe('<html><head></head><body>api</body></html>');
    expect(out).not.toContain('wfm.js');
  });

  it('non-HTML responses untouched (no inject)', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '{"a":1}',
      originContentType: 'application/json',
      trackCalls,
    });

    // Non-asset path so we exercise the content-type branch (not looksLikeAsset).
    const request = new Request(`${ORIGIN}/export`, {
      headers: { 'user-agent': 'GPTBot/1.0' },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    // Bot + non-HTML → no server-track, no wfm inject (cookie still rolled).
    expect(trackCalls).toHaveLength(0);
    const out = await response.text();
    expect(out).toBe('{"a":1}');
    expect(out).not.toContain('wfm.js');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('tracking failure never breaks the response', async () => {
    const trackCalls: TrackCall[] = [];
    const fetchImpl = mockFetch({
      originBody: '<html><head></head><body>ok</body></html>',
      trackFail: true,
      trackCalls,
    });

    const request = new Request(`${ORIGIN}/ok`, {
      headers: { 'user-agent': 'Googlebot/2.1' },
    });

    const ctx = createExecutionContext();
    const response = await handleRequest(request, testEnv(), ctx, fetchImpl);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('wfm.js');
  });

  it('default export fetch uses env from wrangler (smoke)', async () => {
    // Smoke: worker default export is callable with bindings from wrangler.toml.
    // Origin fetch is not mocked here — only verify the handler shape.
    expect(typeof worker.fetch).toBe('function');
    expect((env as WorkerEnv).TRACKING_KEY).toBeTruthy();
  });
});
