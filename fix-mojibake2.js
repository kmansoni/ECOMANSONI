const fs = require('fs');

// ── Fix ChatShortcutsBar.tsx mojibake via exact hex patterns ──────────────
const f = 'src/components/chat/ChatShortcutsBar.tsx';
const buf = Buffer.from(fs.readFileSync(f));

// Map: hexFind → hexReplace
const fixes = [
  // comment dividers: replace corrupted UTF-8 over UTF-8 with em-dash lines
  // Pattern in file: "// " followed by the corrupted bytes for "─" × 42
  // The corrupted "─" (U+2500, UTF-8: E2 94 80) double-encoded:
  //   first encode: E2 94 80
  //   treated as Latin-1 chars: â € “  (or similar)
  //   re-encoded to UTF-8: C3 A2 C2 80 E2 80 9C  (varies by exact chars)
  // We'll replace each occurrence of "// " + corrupted bytes as a whole line

  // For now, let me look for the exact byte sequence of the common corrupted pattern
];

// Strategy: read as latin1 to get the mojibake as intended, then re-encode properly
let text = buf.toString('latin1');

// The file was likely correct UTF-8 originally, then mis-encoded.
// Each "ÃX" pattern = one byte of a multi-byte UTF-8 sequence.
// decodeURIComponent(escape()) fixes this in old JS.
try {
  text = decodeURIComponent(escape(text));
} catch(e) {
  console.log('Double-decode failed, trying alternative...');
}

fs.writeFileSync(f, text);
console.log('Wrote fixed file, checking...');

// Verify: read back and check
const check = fs.readFileSync(f, 'utf8');
for (let i = 0; i < Math.min(check.length, 500); i++) {
  const c = check.charCodeAt(i);
  if (c === 0xFFFD || (c > 0x7F && c < 0x400)) continue; // skip non-ASCII (Cyrillic is fine)
  if (c > 0x7F && c < 0xA0) {
    console.log('Possible corruption at pos', i, 'char', c);
  }
}
console.log('Check complete');
