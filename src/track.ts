import {
  INTEGRATION_SOURCE,
  TRACK_TIMEOUT_MS,
  type WorkerEnv,
} from './config';
import { extractUtm, resolveApiUrl } from './resolve';

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  );
}

export function clientCountry(request: Request): string {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  const fromCf = cf?.country || request.headers.get('cf-ipcountry') || '';
  return String(fromCf).toUpperCase();
}

export type ServerTrackPayload = {
  url: string;
  referrer: string;
  session_id: string;
  client_ip: string;
  country: string;
  status_code: number;
  method: string;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
};

export function buildServerTrackPayload(
  request: Request,
  sid: string,
  status: number,
  method: string,
): ServerTrackPayload {
  const utm = extractUtm(request.url);
  return {
    url: request.url,
    referrer: request.headers.get('referer') || '',
    session_id: sid,
    client_ip: clientIp(request),
    country: clientCountry(request),
    status_code: status,
    method,
    source: INTEGRATION_SOURCE,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
  };
}

/**
 * POST server-track. Never throws to callers when used with .catch — short timeout.
 */
export async function postServerTrack(
  request: Request,
  env: WorkerEnv,
  sid: string,
  status: number,
  method: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const ua = request.headers.get('user-agent') || '';
  const body = buildServerTrackPayload(request, sid, status, method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS);
  try {
    await fetchImpl(resolveApiUrl(env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tracking-Key': env.TRACKING_KEY,
        'User-Agent': ua,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
