import { describe, expect, it } from 'vitest';
import { isBotUa } from '../src/bot';
import {
  buildInjectTags,
  scriptLooksTracked,
} from '../src/inject';
import {
  isExcludedPath,
  looksLikeAsset,
  parseExcludedPatterns,
  pathMatchesGlob,
} from '../src/paths';
import {
  resolveApiUrl,
  resolveSpyderScriptUrl,
  extractUtm,
} from '../src/resolve';
import {
  getOrCreateSessionId,
  parseCookies,
  sessionSetCookie,
} from '../src/session';
import {
  buildServerTrackPayload,
  clientCountry,
  clientIp,
} from '../src/track';

describe('isBotUa', () => {
  it('detects common LLM / search bots', () => {
    expect(isBotUa('Mozilla/5.0 GPTBot/1.0')).toBe(true);
    expect(isBotUa('ClaudeBot/1.0')).toBe(true);
    expect(isBotUa('Googlebot/2.1')).toBe(true);
    expect(isBotUa('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
  });

  it('does not flag normal browsers', () => {
    expect(
      isBotUa(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });
});

describe('session cookie', () => {
  it('parses and reuses valid _spyd_sid', () => {
    const req = new Request('https://example.com/', {
      headers: { Cookie: '_spyd_sid=abc12345; other=1' },
    });
    expect(getOrCreateSessionId(req)).toBe('abc12345');
  });

  it('creates cf_ uuid when missing/invalid', () => {
    const req = new Request('https://example.com/');
    const sid = getOrCreateSessionId(req);
    expect(sid.startsWith('cf_')).toBe(true);
    expect(sid.length).toBeGreaterThan(10);
  });

  it('builds SameSite=Lax rolling cookie', () => {
    expect(sessionSetCookie('sid_test_1')).toContain('_spyd_sid=sid_test_1');
    expect(sessionSetCookie('sid_test_1')).toContain('SameSite=Lax');
    expect(sessionSetCookie('sid_test_1')).toContain('Max-Age=1800');
  });

  it('parseCookies decodes values', () => {
    expect(parseCookies('a=b%20c')).toEqual({ a: 'b c' });
  });
});

describe('paths', () => {
  it('detects static assets', () => {
    expect(looksLikeAsset('https://ex.com/app.js')).toBe(true);
    expect(looksLikeAsset('https://ex.com/style.CSS')).toBe(true);
    expect(looksLikeAsset('https://ex.com/blog/post')).toBe(false);
  });

  it('matches excluded path globs', () => {
    const patterns = parseExcludedPatterns(
      '/api/*,/admin*,/dashboard*,*auth*,*webhook*,/build/*,/storage/*',
    );
    expect(isExcludedPath('https://ex.com/api/users', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/admin/settings', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/dashboard', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/login/auth/callback', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/hooks/webhook/stripe', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/build/assets/app.js', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/storage/file.pdf', patterns)).toBe(true);
    expect(isExcludedPath('https://ex.com/blog/hello', patterns)).toBe(false);
    expect(pathMatchesGlob('/api/v1', '/api/*')).toBe(true);
  });
});

describe('resolve + track payload', () => {
  it('resolves API_URL and script URL', () => {
    expect(resolveApiUrl({ TRACKING_KEY: 'k' })).toBe(
      'https://api.spyderbot.net/server-track',
    );
    expect(
      resolveApiUrl({ TRACKING_KEY: 'k', API_ORIGIN: 'https://api.example.test/' }),
    ).toBe('https://api.example.test/server-track');
    expect(resolveSpyderScriptUrl({ TRACKING_KEY: 'k' }, 'tk_1')).toContain(
      'wfm.js?key=tk_1&v=1.1.1',
    );
  });

  it('builds ingest body with CF headers and utm', () => {
    const req = new Request('https://ex.com/p?utm_source=x&utm_medium=y&utm_campaign=z', {
      headers: {
        'user-agent': 'GPTBot',
        referer: 'https://ref.test/',
        'cf-connecting-ip': '203.0.113.9',
        'cf-ipcountry': 'us',
      },
    });
    const body = buildServerTrackPayload(req, 'cf_abc', 200, 'GET');
    expect(body).toMatchObject({
      session_id: 'cf_abc',
      client_ip: '203.0.113.9',
      country: 'US',
      status_code: 200,
      method: 'GET',
      source: 'cf_worker',
      utm_source: 'x',
      utm_medium: 'y',
      utm_campaign: 'z',
      referrer: 'https://ref.test/',
    });
    expect(clientIp(req)).toBe('203.0.113.9');
    expect(clientCountry(req)).toBe('US');
    expect(extractUtm(req.url).utm_source).toBe('x');
  });
});

describe('inject helpers', () => {
  it('detects existing tracker script src', () => {
    expect(scriptLooksTracked('https://spyderbot.net/wfm.js?key=1')).toBe(true);
    expect(scriptLooksTracked('/js/app.js')).toBe(false);
  });

  it('builds preconnect + async script tags', () => {
    const tags = buildInjectTags('https://spyderbot.net', 'https://spyderbot.net/wfm.js?key=k');
    expect(tags.preconnectTag).toContain('rel="preconnect"');
    expect(tags.scriptTag).toContain('async');
    expect(tags.scriptTag).toContain('wfm.js?key=k');
  });
});
