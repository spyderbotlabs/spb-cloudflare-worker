import {
  DEFAULT_API_URL,
  DEFAULT_SCRIPT_ORIGIN,
  DEFAULT_SCRIPT_VERSION,
  type WorkerEnv,
} from './config';
import { parseExcludedPatterns } from './paths';

export function resolveApiUrl(env: WorkerEnv): string {
  if (env.API_URL && env.API_URL.trim()) {
    return env.API_URL.trim().replace(/\/$/, '');
  }
  if (env.API_ORIGIN && env.API_ORIGIN.trim()) {
    return `${env.API_ORIGIN.trim().replace(/\/$/, '')}/server-track`;
  }
  return DEFAULT_API_URL;
}

export function resolveScriptOrigin(env: WorkerEnv): string {
  return (env.SCRIPT_ORIGIN || DEFAULT_SCRIPT_ORIGIN).replace(/\/$/, '');
}

export function resolveScriptVersion(env: WorkerEnv): string {
  return env.SCRIPT_VERSION || DEFAULT_SCRIPT_VERSION;
}

export function resolveSpyderScriptUrl(env: WorkerEnv, trackingKey: string): string {
  if (env.SPYDER_SCRIPT_URL && env.SPYDER_SCRIPT_URL.trim()) {
    return env.SPYDER_SCRIPT_URL.trim();
  }
  const origin = resolveScriptOrigin(env);
  const version = resolveScriptVersion(env);
  return `${origin}/wfm.js?key=${encodeURIComponent(trackingKey)}&v=${version}`;
}

export function resolveExcludedPatterns(env: WorkerEnv): string[] {
  return parseExcludedPatterns(env.EXCLUDED_PATH_PATTERNS);
}

export function extractUtm(url: string): {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
} {
  try {
    const u = new URL(url);
    return {
      utm_source: u.searchParams.get('utm_source') || '',
      utm_medium: u.searchParams.get('utm_medium') || '',
      utm_campaign: u.searchParams.get('utm_campaign') || '',
    };
  } catch {
    return { utm_source: '', utm_medium: '', utm_campaign: '' };
  }
}
