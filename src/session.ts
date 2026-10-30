import { SESSION_COOKIE, SESSION_TTL_SEC } from './config';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

export function getOrCreateSessionId(request: Request): string {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const existing = cookies[SESSION_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) {
    return existing;
  }
  return `cf_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function sessionSetCookie(sid: string): string {
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(sid)}` +
    `; Path=/; Max-Age=${SESSION_TTL_SEC}` +
    '; SameSite=Lax'
  );
}

export function withSessionHeaders(
  response: Response,
  sid: string,
  stripValidators: boolean,
): Response {
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
