import { ASSET_PATH_RE } from './config';

/** True for obvious static asset URLs (extension-based). */
export function looksLikeAsset(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return ASSET_PATH_RE.test(path);
  } catch {
    return false;
  }
}

/**
 * Simple path glob: `*` matches any sequence (including `/`).
 * Patterns are matched against the request pathname only.
 */
export function pathMatchesGlob(pathname: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern) return false;
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(pathname);
}

export function parseExcludedPatterns(raw: string | undefined | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isExcludedPath(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  try {
    const pathname = new URL(url).pathname;
    return patterns.some((p) => pathMatchesGlob(pathname, p));
  } catch {
    return false;
  }
}
