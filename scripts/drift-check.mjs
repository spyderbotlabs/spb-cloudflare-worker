#!/usr/bin/env node
/**
 * Drift check: compare this repo's paste-ready snippet with the app fixture
 * (snapshot of who-follow-me CloudflareWorkerSnippetBuilder / cloudflare-worker-snippet.ts).
 *
 * Usage:
 *   node scripts/drift-check.mjs
 *   node scripts/drift-check.mjs --strict   # fail on intentional deltas too
 *
 * Exit 0 = in sync (or only known deltas). Exit 1 = unexpected drift.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPasteSnippet } from './snippet-template.mjs';
import { normalizeJs } from './normalize-js.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fixturePath = join(root, 'test/fixtures/app-worker-snippet.js');
const strict = process.argv.includes('--strict');

const SHARED = {
  trackingKey: 'YOUR_TRACKING_KEY',
  serverTrackUrl: 'https://api.spyderbot.net/server-track',
  scriptOrigin: 'https://spyderbot.net',
  scriptVersion: '1.1.1',
};

/** Remove regions that this repo intentionally improved ahead of the app. */
function stripIntentionalDeltas(source) {
  let s = source;
  // Source header line unique to this repo
  s = s.replace(/^\/\/ Source:.*$/gm, '');
  // Timeout constant + AbortController wrapper around fetch
  s = s.replace(/^const TRACK_TIMEOUT_MS = 1500;\n?/m, '');
  s = s.replace(
    /const controller = new AbortController\(\);\s*\n\s*const timer = setTimeout\([\s\S]*?\);\s*\n\s*try \{\s*\n\s*/,
    '',
  );
  s = s.replace(/\n\s*\}\s*finally \{\s*\n\s*clearTimeout\(timer\);\s*\n\s*\}/, '');
  s = s.replace(/\n\s*signal: controller\.signal,?/g, '');
  // extractUtm function + call sites / body fields
  s = s.replace(/\nfunction extractUtm\(url\) \{[\s\S]*?\n\}\n/, '\n');
  s = s.replace(/\n\s*const utm = extractUtm\(request\.url\);/g, '');
  s = s.replace(/\n\s*utm_source: utm\.utm_source,/g, '');
  s = s.replace(/\n\s*utm_medium: utm\.utm_medium,/g, '');
  s = s.replace(/\n\s*utm_campaign: utm\.utm_campaign,/g, '');
  return s;
}

function requiredMarkers(label, source) {
  const need = [
    '_spyd_sid',
    'client_ip',
    "source: 'cf_worker'",
    'HTMLRewriter',
    'isBotUa',
    'cf-connecting-ip',
    'cf-ipcountry',
    'X-Tracking-Key',
    'wfm.js',
    'alreadyTagged',
  ];
  const missing = need.filter((m) => !source.includes(m));
  if (missing.length) {
    console.error(`[${label}] missing markers: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

const oursRaw = buildPasteSnippet(SHARED);
const appRaw = readFileSync(fixturePath, 'utf8');

if (!requiredMarkers('repo', oursRaw) || !requiredMarkers('app-fixture', appRaw)) {
  process.exit(1);
}

const oursCmp = strict ? oursRaw : stripIntentionalDeltas(oursRaw);
const appCmp = strict ? appRaw : stripIntentionalDeltas(appRaw);

const oursN = normalizeJs(oursCmp);
const appN = normalizeJs(appCmp);

if (oursN === appN) {
  console.log(
    strict
      ? 'drift-check: OK (strict — exact semantic match)'
      : 'drift-check: OK (core behaviour matches app fixture; intentional deltas stripped)',
  );
  if (!strict) {
    console.log(
      'Intentional deltas vs app (documented): TRACK_TIMEOUT_MS/AbortController, utm_* body fields, Source header.',
    );
  }
  process.exit(0);
}

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'drift-ours.normalized.js'), oursN);
writeFileSync(join(outDir, 'drift-app.normalized.js'), appN);

console.error('drift-check: FAIL — unexpected divergence from app fixture');
console.error(`Wrote ${join(outDir, 'drift-ours.normalized.js')}`);
console.error(`Wrote ${join(outDir, 'drift-app.normalized.js')}`);

// Show a short window around first mismatch
const max = Math.min(oursN.length, appN.length);
let idx = 0;
while (idx < max && oursN[idx] === appN[idx]) idx += 1;
const start = Math.max(0, idx - 80);
console.error('--- ours @ mismatch ---');
console.error(oursN.slice(start, idx + 120));
console.error('--- app @ mismatch ---');
console.error(appN.slice(start, idx + 120));
process.exit(1);
