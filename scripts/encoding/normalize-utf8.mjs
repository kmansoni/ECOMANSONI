import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EXT_ALLOW = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".md"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".next", ".vercel", ".netlify", ".turbo"]);

const WRITE = process.argv.includes("--write");

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

// Heuristic: detect common UTF-8 bytes mis-decoded as CP1251.
// Markers include rare Cyrillic Supplement characters frequently produced by this corruption.
const MOJIBAKE_MARKERS = /[������������]/; // U+0403..U+045F subset

function fixMojibakeUtf8AsCp1251(text) {
  // Convert: current string is what you get when UTF-8 bytes were interpreted as CP1251.
  // To recover: encode as CP1251 bytes, then decode as UTF-8.
  // We implement minimal CP1251 encoding for the byte range 0x00..0xFF by mapping via iconv tables.

  const cp1251 = (function () {
    // Build a byte->unicode map for CP1251.
    // Source: standard CP1251 table.
    const map = new Array(256).fill("\uFFFD");
    for (let i = 0; i < 128; i++) map[i] = String.fromCharCode(i);

    const upper = [
      0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021,
      0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
      0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
      0x0098, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
      0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7,
      0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
      0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7,
      0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
      0x0410, 0x0411, 0x0412, 0x0413, 0x0414, 0x0415, 0x0416, 0x0417,
      0x0418, 0x0419, 0x041a, 0x041b, 0x041c, 0x041d, 0x041e, 0x041f,
      0x0420, 0x0421, 0x0422, 0x0423, 0x0424, 0x0425, 0x0426, 0x0427,
      0x0428, 0x0429, 0x042a, 0x042b, 0x042c, 0x042d, 0x042e, 0x042f,
      0x0430, 0x0431, 0x0432, 0x0433, 0x0434, 0x0435, 0x0436, 0x0437,
      0x0438, 0x0439, 0x043a, 0x043b, 0x043c, 0x043d, 0x043e, 0x043f,
      0x0440, 0x0441, 0x0442, 0x0443, 0x0444, 0x0445, 0x0446, 0x0447,
      0x0448, 0x0449, 0x044a, 0x044b, 0x044c, 0x044d, 0x044e, 0x044f,
    ];
    for (let i = 0; i < upper.length; i++) {
      map[0x80 + i] = String.fromCharCode(upper[i]);
    }

    const reverse = new Map();
    for (let i = 0; i < 256; i++) {
      reverse.set(map[i], i);
    }
    return { toByte: (ch) => reverse.get(ch) };
  })();

  const bytes = [];
  for (const ch of text) {
    const b = cp1251.toByte(ch);
    if (typeof b !== "number") {
      // If we can't encode, bail out.
      return null;
    }
    bytes.push(b);
  }

  try {
    return Buffer.from(Uint8Array.from(bytes)).toString("utf8");
  } catch {
    return null;
  }
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
      continue;
    }
    const ext = name.toLowerCase().slice(name.lastIndexOf("."));
    if (!EXT_ALLOW.has(ext)) continue;
    out.push(p);
  }
}

const files = [];
walk(ROOT, files);

let changed = 0;
let bomRemoved = 0;
let mojibakeFixed = 0;

for (const f of files) {
  const buf = readFileSync(f);
  let text = buf.toString("utf8");
  let next = text;
  let touched = false;

  if (hasBom(buf)) {
    next = next.replace(/^\uFEFF/, "");
    touched = true;
    bomRemoved++;
  }

  if (MOJIBAKE_MARKERS.test(next)) {
    const fixed = fixMojibakeUtf8AsCp1251(next);
    if (fixed && fixed !== next && !MOJIBAKE_MARKERS.test(fixed)) {
      next = fixed;
      touched = true;
      mojibakeFixed++;
    }
  }

  if (touched && next !== text) {
    changed++;
    if (WRITE) {
      writeFileSync(f, next, { encoding: "utf8" });
    }
    const rel = f.replace(ROOT + "\\", "");
    console.log(`${WRITE ? "fixed" : "would-fix"}: ${rel}`);
  }
}

console.log("normalize-utf8 summary:", {
  write: WRITE,
  filesScanned: files.length,
  filesChanged: changed,
  bomRemoved,
  mojibakeFixed,
});

if (!WRITE && changed > 0) {
  console.log("Run with --write to apply changes.");
}
