/**
 * fix-encoding.mjs — исправляет mojibake в указанных файлах.
 * 
 * Алгоритм: файл сохранён с кодировкой latin1 (каждый UTF-8 байт → отдельный char),
 * восстанавливаем: читаем как binary, Buffer.from(..., 'binary') → toString('utf8').
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'src/components/chat/ReactionPacksSheet.tsx',
  'supabase/migrations/20260311200001_reaction_packs.sql',
  'supabase/migrations/20260310000001_silent_messages.sql',
  'supabase/functions/link-preview/index.ts',
  'src/hooks/useReactionPacks.ts',
];

// Проверяет: есть ли в строке (binary) 2-байтные UTF-8 последовательности (0xC0-0xDF + 0x80-0xBF)
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

function tryFix(filePath) {
  const buf = readFileSync(filePath);
  const asBinary = buf.toString('binary');
  
  if (!hasMojibakeInBinary(asBinary)) {
    console.log(`SKIP (no mojibake): ${filePath}`);
    return false;
  }
  
  // Восстанавливаем: интерпретируем latin1-байты как UTF-8
  const fixed = Buffer.from(asBinary, 'binary').toString('utf8');
  
  // Проверяем результат — должна появиться кириллица
  const cyrillicRe = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicRe.test(fixed);
  const hasRemainingMojibake = hasMojibakeInBinary(fixed);
  
  console.log(`${filePath}: hasCyrillic=${hasCyrillic}, remainingMojibake=${hasRemainingMojibake}`);
  
  if (!hasRemainingMojibake) {
    writeFileSync(filePath, fixed, 'utf8');
    console.log(`  FIXED: ${filePath}`);
    return true;
  } else {
    console.log(`  SKIP (fix not clean): ${filePath}`);
    return false;
  }
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
