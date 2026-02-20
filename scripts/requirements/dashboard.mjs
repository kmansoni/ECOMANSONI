import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inPath = path.join(process.cwd(), "docs", "requirements", "telegram-500.yaml");
const outPath = path.join(process.cwd(), "docs", "requirements", "dashboard.md");
const derivedSummaryPath = path.join(process.cwd(), "docs", "requirements", "derived", "summary.json");

function parseYamlVeryLight(text) {
  // Tiny YAML reader for this specific file shape.
  // Assumes 2-space indentation and simple scalars.
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("  - id:")) {
      if (current) tasks.push(current);
      const id = Number(line.split(":")[1].trim());
      current = { id };
      continue;
    }
    if (!current) continue;
    const m = line.match(/^\s{4}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value === "[]") value = "[]";
    if (value === "true") current[key] = true;
    else if (value === "false") current[key] = false;
    else if (value.startsWith('"') && value.endsWith('"')) current[key] = value.slice(1, -1);
    else if (/^-?\d+$/.test(value)) current[key] = Number(value);
    else current[key] = value;
  }
  if (current) tasks.push(current);
  return tasks;
}

function countBy(tasks, key) {
  const m = new Map();
  for (const t of tasks) {
    const v = t[key] ?? "(missing)";
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function pct(n, d) {
  if (!d) return "0%";
  return ((n / d) * 100).toFixed(1) + "%";
}

function renderMermaid(tasks) {
  // High-level dependency graph by section (A..F)
  const bySection = new Map();
  for (const t of tasks) {
    const s = t.section;
    bySection.set(s, (bySection.get(s) ?? 0) + 1);
  }

  const done = tasks.filter((t) => t.status === "done").length;

  return `flowchart LR\n  A[\"A (1–60)\"] --> B[\"B (61–140)\"] --> C[\"C (141–220)\"] --> D[\"D (221–320)\"] --> E[\"E (321–400)\"] --> F[\"F (401–500)\"]\n\n  classDef todo fill:#1f2937,stroke:#94a3b8,color:#e5e7eb;\n  classDef done fill:#065f46,stroke:#34d399,color:#ecfdf5;\n\n  class A,B,C,D,E,F todo;\n\n  %% totals: ${tasks.length}, done: ${done} (${pct(done, tasks.length)})\n`;
}

function renderGantt(tasks) {
  // Synthetic schedule: allocate each section into a phase window.
  // This is a planning visualization, not real dates.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const addDays = (d) => {
    const x = new Date(start);
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
  };

  const phases = [
    { name: "A Foundation", from: 0, to: 14 },
    { name: "B Messaging", from: 14, to: 45 },
    { name: "C Groups/Channels", from: 45, to: 75 },
    { name: "D Security", from: 75, to: 105 },
    { name: "E Quality/SRE", from: 105, to: 135 },
    { name: "F UX/Multi-platform", from: 135, to: 165 },
  ];

  const lines = [
    "gantt",
    "  title Telegram-level 500 Tasks (Planning)",
    "  dateFormat  YYYY-MM-DD",
    "  axisFormat  %m-%d",
  ];

  for (const p of phases) {
    lines.push(`  section ${p.name}`);
    lines.push(`  ${p.name} : ${addDays(p.from)}, ${addDays(p.to)}`);
  }

  return lines.join("\n") + "\n";
}

async function main() {
  const text = await readFile(inPath, "utf8");
  const tasks = parseYamlVeryLight(text);

  let derivedSummary = null;
  try {
    derivedSummary = JSON.parse(await readFile(derivedSummaryPath, "utf8"));
  } catch {
    derivedSummary = null;
  }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;

  const bySection = countBy(tasks, "section");
  const byStatus = countBy(tasks, "status");

  const md = [
    "# Requirements Dashboard",
    "",
    `- Total tasks: **${total}**`,
    `- Done: **${done}** (${pct(done, total)})`,
    `- In progress: **${inProgress}**`,
    `- Todo: **${todo}**`,
    derivedSummary
      ? `- Derived scenarios (min): **${derivedSummary.derivedTotal}** (minPerTask=${derivedSummary.minPerTask})`
      : "- Derived scenarios: *(run npm run req:derive)*",
    "",
    "## By Section",
    "",
    ...bySection.map(([k, v]) => `- ${k}: ${v}`),
    "",
    derivedSummary ? "## Derived By Section" : null,
    derivedSummary ? "" : null,
    derivedSummary
      ? Object.entries(derivedSummary.bySection)
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
          .map(([k, v]) => `- ${k}: tasks=${v.tasks}, derived=${v.derived}`)
          .join("\n")
      : null,
    derivedSummary ? "" : null,
    "## By Status",
    "",
    ...byStatus.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Graph (Sections)",
    "",
    "```mermaid",
    renderMermaid(tasks).trimEnd(),
    "```",
    "",
    "## Schedule (Synthetic Gantt)",
    "",
    "```mermaid",
    renderGantt(tasks).trimEnd(),
    "```",
    "",
  ].join("\n");

  await writeFile(outPath, md, "utf8");
  console.log(`[req:dashboard] Wrote ${outPath}`);
}

await main();
