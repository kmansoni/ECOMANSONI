import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EXT_ALLOW = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".md"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".next", ".vercel", ".netlify", ".turbo"]);

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
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

const offenders = [];
for (const f of files) {
  const buf = readFileSync(f);
  if (hasBom(buf)) offenders.push(f);
}

if (offenders.length) {
  console.error(`BOM guard: found UTF-8 BOM in ${offenders.length} file(s):`);
  for (const f of offenders) {
    console.error(` - ${f.replace(ROOT + "\\", "")}`);
  }
  process.exitCode = 1;
} else {
  console.log("BOM guard: OK (no UTF-8 BOM found)");
}
