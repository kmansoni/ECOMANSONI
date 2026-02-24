import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "docs", "governance", "project-to-implementation-1.md");

if (!fs.existsSync(file)) {
  console.error("Project checklist file not found:", file);
  process.exit(1);
}

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
const out = [];

for (const line of lines) {
  if (line.startsWith("## ")) out.push(`\n${line.replace(/^##\s*/, "")}`);
  if (/^- \[.\]/.test(line)) out.push(line);
}

console.log("PROJECT TO IMPLEMENTATION 1 - REALIZATION LIST");
console.log(out.join("\n"));
