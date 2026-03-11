import { readFileSync } from 'node:fs';

const FILES = [
  'src/components/chat/ReactionPacksSheet.tsx',
  'supabase/migrations/20260311200001_reaction_packs.sql',
  'supabase/migrations/20260310000001_silent_messages.sql',
  'supabase/functions/link-preview/index.ts',
  'src/hooks/useReactionPacks.ts',
  '.env.example',
  'plans/CRM_MESSENGER_INTEGRATION_DESIGN.md',
  'scripts/diagnostics/run-24x7.mjs',
];

function hasMoji(s) {
  for (let i = 0; i < s.length - 1; i++) {
    const c1 = s.charCodeAt(i), c2 = s.charCodeAt(i + 1);
    if (c1 >= 0xc0 && c1 <= 0xdf && c2 >= 0x80 && c2 <= 0xbf) return true;
  }
  return false;
}

for (const f of FILES) {
  const buf = readFileSync(f);
  const binary = buf.toString('binary');
  const utf8 = buf.toString('utf8');
  const mojibake = hasMoji(binary);
  const hasReplacement = (utf8.match(/\ufffd/g) || []).length;
  const cyrillicCount = (utf8.match(/[\u0400-\u04FF]/g) || []).length;
  const status = mojibake ? 'STILL_MOJIBAKE' : hasReplacement > 0 ? `HAS_REPLACEMENT(${hasReplacement})` : 'OK';
  console.log(`${status}\t${cyrillicCount} cyr\t${f}`);
}
