import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(ROOT, "src", "hooks"),
  path.join(ROOT, "src", "components"),
  path.join(ROOT, "src", "lib"),
];
const EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    out.push(abs);
  }
}

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const files = [];
for (const dir of TARGET_DIRS) walk(dir, files);

const failures = [];
const callPattern = /sendMessageV1\s*\(\s*\{[\s\S]*?\}\s*\)/g;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.matchAll(callPattern);
  for (const match of matches) {
    const block = match[0] || "";
    if (block.includes("clientMsgId")) continue;
    const idx = match.index ?? 0;
    failures.push({
      file: path.relative(ROOT, file).replace(/\\/g, "/"),
      line: lineAt(source, idx),
      snippet: block.split("\n").slice(0, 3).join(" ").trim(),
    });
  }
}

if (failures.length > 0) {
  console.error("[chat-client-msg-id-check] sendMessageV1 calls without clientMsgId found:");
  for (const f of failures) {
    console.error(`- ${f.file}:${f.line} :: ${f.snippet}`);
  }
  process.exit(1);
}

console.log("[chat-client-msg-id-check] OK: all sendMessageV1 calls provide clientMsgId");
