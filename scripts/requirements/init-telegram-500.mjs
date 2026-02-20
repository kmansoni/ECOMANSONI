import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const outPath = path.join(process.cwd(), "docs", "requirements", "telegram-500.yaml");

/**
 * Creates a 500-task scaffold with correct section mapping:
 * A: 1–60, B: 61–140, C: 141–220, D: 221–320, E: 321–400, F: 401–500
 */
function sectionFor(id) {
  if (id >= 1 && id <= 60) return "A";
  if (id >= 61 && id <= 140) return "B";
  if (id >= 141 && id <= 220) return "C";
  if (id >= 221 && id <= 320) return "D";
  if (id >= 321 && id <= 400) return "E";
  if (id >= 401 && id <= 500) return "F";
  return "?";
}

const sectionTitles = {
  A: "Продуктовая таксономия и генератор функций",
  B: "Архитектура сообщений и доставка",
  C: "Группы/каналы: права, модерация, масштаб",
  D: "Безопасность, приватность, анти-абьюз",
  E: "Качество, тесты, наблюдаемость, SRE",
  F: "Мульти-платформа, UX, доступность, i18n",
};

function yamlEscape(s) {
  return s.replace(/"/g, "\\\"");
}

function makeYaml() {
  const header = [
    "version: 1",
    "generated_at: " + new Date().toISOString(),
    "source: scaffold",
    "sections:",
    ...Object.entries(sectionTitles).map(([k, v]) => `  ${k}: \"${yamlEscape(v)}\"`),
    "tasks:",
  ].join("\n");

  const tasks = [];
  for (let id = 1; id <= 500; id++) {
    const section = sectionFor(id);
    tasks.push(
      `  - id: ${id}`,
      `    section: ${section}`,
      `    title: \"${section}-${id}: TBD\"`,
      `    status: todo`,
      `    priority: P1`,
      `    risk: reliability`,
      `    complexity: M`,
      `    deprecated: false`,
      `    req_id: REQ-${String(id).padStart(4, "0")}`,
      `    scenarios_min: 15`,
      `    scenarios_done: 0`,
      `    deps: []`,
    );
  }

  return header + "\n" + tasks.join("\n") + "\n";
}

async function main() {
  // Default: do NOT overwrite. This command is used in CI and should be idempotent.
  // To force regeneration: REQ_INIT_FORCE=1 npm run req:init
  let exists = false;
  try {
    await readFile(outPath, "utf8");
    exists = true;
  } catch {
    exists = false;
  }

  const force = process.env.REQ_INIT_FORCE === "1";
  if (exists && !force) {
    console.log(`[req:init] Exists, skipping: ${outPath}`);
    return;
  }

  await writeFile(outPath, makeYaml(), "utf8");
  console.log(`[req:init] Wrote ${outPath}`);
}

await main();
