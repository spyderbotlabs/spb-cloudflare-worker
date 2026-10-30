/**
 * Semantic-ish normalize for Worker snippet drift checks:
 * strip block/line comments and collapse whitespace outside string literals.
 */

export function normalizeJs(source) {
  let i = 0;
  let out = '';
  const s = String(source);

  const pushCollapsed = (chunk) => {
    out += chunk.replace(/\s+/g, ' ');
  };

  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];

    // line comment
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }

    // block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < s.length && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    // string literals — keep verbatim
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let buf = ch;
      while (j < s.length) {
        const c = s[j];
        buf += c;
        if (c === '\\') {
          j += 1;
          if (j < s.length) buf += s[j];
          j += 1;
          continue;
        }
        if (c === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += buf;
      i = j;
      continue;
    }

    // regex literals (heuristic after = ( [ , : ! & | ? { } ; return)
    if (ch === '/') {
      const prev = out.trimEnd().slice(-1);
      if (!prev || '=(,[:!&|?{};~+-*%<>^'.includes(prev) || out.trimEnd().endsWith('return')) {
        let j = i + 1;
        let buf = '/';
        let inClass = false;
        while (j < s.length) {
          const c = s[j];
          buf += c;
          if (c === '\\') {
            j += 1;
            if (j < s.length) buf += s[j];
            j += 1;
            continue;
          }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) {
            j += 1;
            while (j < s.length && /[a-z]/i.test(s[j])) {
              buf += s[j];
              j += 1;
            }
            break;
          }
          j += 1;
        }
        out += buf;
        i = j;
        continue;
      }
    }

    // whitespace collapse
    if (/\s/.test(ch)) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      pushCollapsed(' ');
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out.replace(/\s+/g, ' ').trim();
}

/** Drop known intentional deltas so core behaviour can still be compared. */
export function stripKnownDeltas(normalized) {
  let n = normalized;
  // timeout machinery
  n = n.replace(/const TRACK_TIMEOUT_MS = 1500;/g, '');
  n = n.replace(/const controller = new AbortController\(\);/g, '');
  n = n.replace(
    /const timer = setTimeout\(function \(\) \{ controller\.abort\(\); \}, TRACK_TIMEOUT_MS\);/g,
    '',
  );
  n = n.replace(/const timer = setTimeout\(\(\) => controller\.abort\(\), TRACK_TIMEOUT_MS\);/g, '');
  n = n.replace(/signal: controller\.signal,?/g, '');
  n = n.replace(/try \{ await fetch\(SERVER_TRACK_URL,/g, 'await fetch(SERVER_TRACK_URL,');
  n = n.replace(/\}\s*finally \{\s*clearTimeout\(timer\);\s*\}/g, '');
  // utm helpers / fields (app reads UTM from URL server-side anyway)
  n = n.replace(/function extractUtm\(url\) \{[\s\S]*?\}/g, '');
  n = n.replace(/const utm = extractUtm\(request\.url\);/g, '');
  n = n.replace(/utm_source: utm\.utm_source,/g, '');
  n = n.replace(/utm_medium: utm\.utm_medium,/g, '');
  n = n.replace(/utm_campaign: utm\.utm_campaign,/g, '');
  // repo source comment / canonical pointer (may appear in header comments already stripped)
  n = n.replace(/Source: https:\/\/gits\.trendi\.ai\/spyderbot\/spb-cloudflare-worker \(canonical Worker project\)/g, '');
  return n.replace(/\s+/g, ' ').trim();
}
