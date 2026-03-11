/**
 * fix-encoding2.mjs — исправляет тройной mojibake (двойной roundtrip latin1<->utf8).
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'src/components/chat/ReactionPacksSheet.tsx',
  'supabase/migrations/20260311200001_reaction_packs.sql',
  'supabase/migrations/20260310000001_silent_messages.sql',
];

function hasMojibakeInBinary(binaryStr) {
  for (let i = 0; i < binaryStr.length - 1; i++) {
    const c1 = binaryStr.charCodeAt(i);
    const c2 = binaryStr.charCodeAt(i + 1);
    if (c1 >= 0xc0 && c1 <= 0xdf && c2 >= 0x80 && c2 <= 0xbf) {
      return true;
    }
  }
  return false;
}

function fixOnce(binaryStr) {
  return Buffer.from(binaryStr, 'binary').toString('utf8');
}

function tryFix(filePath) {
  const buf = readFileSync(filePath);
  let str = buf.toString('binary');
  
  // Диагностика: сколько раундов нужно
  let rounds = 0;
  let current = str;
  
  while (hasMojibakeInBinary(current) && rounds < 5) {
    const fixed = fixOnce(current);
    rounds++;
    console.log(`  Round ${rounds}: remainingMojibake=${hasMojibakeInBinary(fixed)}`);
    current = fixed;
    // Если снова появились mojibake-последовательности на следующем round, используем предыдущий результат
    if (!hasMojibakeInBinary(fixed)) {
      break;
    }
  }
  
  const cyrillicRe = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicRe.test(current);
  const hasRemainingMojibake = hasMojibakeInBinary(current);
  
  console.log(`${filePath}: rounds=${rounds}, hasCyrillic=${hasCyrillic}, remainingMojibake=${hasRemainingMojibake}`);
  console.log('  Sample:', current.slice(0, 100));
  
  if (!hasRemainingMojibake && rounds > 0) {
    writeFileSync(filePath, current, 'utf8');
    console.log(`  FIXED (${rounds} rounds): ${filePath}`);
    return true;
  }
  
  console.log(`  SKIP: ${filePath}`);
  return false;
}

let fixedCount = 0;
for (const f of FILES) {
  try {
    if (tryFix(f)) fixedCount++;
  } catch (err) {
    console.error(`ERROR: ${f}:`, err.message);
  }
}

console.log(`\nTotal fixed: ${fixedCount}/${FILES.length}`);
