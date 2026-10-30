#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPasteSnippet } from './snippet-template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const trackingKey = argValue('key', 'YOUR_TRACKING_KEY');
const serverTrackUrl = argValue('api-url', 'https://api.spyderbot.net/server-track');
const scriptOrigin = argValue('script-origin', 'https://spyderbot.net');
const scriptVersion = argValue('script-version', '1.1.1');

const workerSource = buildPasteSnippet({
  trackingKey,
  serverTrackUrl,
  scriptOrigin,
  scriptVersion,
});

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'worker.generated.js');
writeFileSync(outPath, workerSource, 'utf8');
console.log(`Wrote ${outPath}`);
