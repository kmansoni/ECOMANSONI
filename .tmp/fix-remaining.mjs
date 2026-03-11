/**
 * fix-remaining.mjs — исправляет .env.example и plans/CRM*.md
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  '.env.example',
  'plans/CRM_MESSENGER_INTEGRATION_DESIGN.md',
];

function hasMojibake(s) {
  for (let i = 0; i < s.length - 1; i++) {
    const c1 = s.charCodeAt(i), c2 = s.charCodeAt(i + 1);
    if (c1 >= 0xc0 && c1 <= 0xdf && c2 >= 0x80 && c2 <= 0xbf) return true;
  }
  return false;
}

for (const f of FILES) {
  const buf = readFileSync(f);
  let str = buf.toString('binary');
  let rounds = 0;
  while (hasMojibake(str) && rounds < 5) {
    str = Buffer.from(str, 'binary').toString('utf8');
    rounds++;
  }
  const cyrillicRe = /[\u0400-\u04FF]/;
  const hasCyr = cyrillicRe.test(str);
  const stillBad = hasMojibake(str);
  console.log(`${f}: rounds=${rounds}, hasCyrillic=${hasCyr}, stillBad=${stillBad}`);
  // Sample around problematic areas
  const lines = str.split('\n');
  lines.forEach((l, i) => {
    if (i >= 126 && i <= 134) console.log(`  L${i+1}: ${JSON.stringify(l.slice(0, 80))}`);
  });
  if (!stillBad) {
    writeFileSync(f, str, 'utf8');
    console.log(`  FIXED: ${f}`);
  }
}
