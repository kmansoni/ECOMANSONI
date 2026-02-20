import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const tasksPath = path.join(process.cwd(), "docs", "requirements", "telegram-500.yaml");
const matrixPath = path.join(process.cwd(), "docs", "requirements", "matrix.json");
const outDir = path.join(process.cwd(), "docs", "requirements", "derived");
const summaryPath = path.join(outDir, "summary.json");

function parseYamlTasksVeryLight(text) {
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
    if (value === "[]") current[key] = [];
    else if (value === "true") current[key] = true;
    else if (value === "false") current[key] = false;
    else if (value.startsWith('"') && value.endsWith('"')) current[key] = value.slice(1, -1);
    else if (/^-?\d+$/.test(value)) current[key] = Number(value);
    else current[key] = value;
  }
  if (current) tasks.push(current);
  return tasks;
}

function* cartesian(arrays) {
  // arrays: [ [a,b], [c,d], ... ]
  const n = arrays.length;
  const idx = new Array(n).fill(0);
  while (true) {
    yield arrays.map((a, i) => a[idx[i]]);
    let k = n - 1;
    while (k >= 0) {
      idx[k]++;
      if (idx[k] < arrays[k].length) break;
      idx[k] = 0;
      k--;
    }
    if (k < 0) return;
  }
}

function stablePickScenarios(matrix, limit) {
  // Deterministic ordering: platform -> network -> device -> auth -> privacy -> chatState
  const arrays = [
    matrix.platforms,
    matrix.networks,
    matrix.devices,
    matrix.authModes,
    matrix.privacy,
    matrix.chatStates,
  ];

  const result = [];
  for (const combo of cartesian(arrays)) {
    const [platform, network, device, auth, privacy, chatState] = combo;
    result.push({ platform, network, device, auth, privacy, chatState });
    if (result.length >= limit) break;
  }

  return result;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const tasksText = await readFile(tasksPath, "utf8");
  const tasks = parseYamlTasksVeryLight(tasksText);
  const matrix = JSON.parse(await readFile(matrixPath, "utf8"));

  const min = Number(matrix.minPerFeature ?? 15);
  const summary = {
    generated_at: new Date().toISOString(),
    tasks: tasks.length,
    minPerTask: min,
    derivedTotal: tasks.length * min,
    bySection: {},
    files: [],
  };

  for (const t of tasks) {
    const reqId = t.req_id;
    const section = t.section;
    summary.bySection[section] = summary.bySection[section] ?? { tasks: 0, derived: 0 };
    summary.bySection[section].tasks++;
    summary.bySection[section].derived += min;

    const scenarios = stablePickScenarios(matrix, Math.max(min, Number(t.scenarios_min ?? min)));

    const out = {
      req_id: reqId,
      task_id: t.id,
      section,
      title: t.title ?? "",
      derived_count: scenarios.length,
      scenarios: scenarios.map((s, i) => ({
        scenario_id: `${reqId}.S${String(i + 1).padStart(3, "0")}`,
        ...s,
        status: "todo",
        acceptance_test: `src/test/requirements/${reqId}.S${String(i + 1).padStart(3, "0")}.test.ts`,
      })),
    };

    const fileName = `${reqId}.json`;
    await writeFile(path.join(outDir, fileName), JSON.stringify(out, null, 2), "utf8");
    summary.files.push(fileName);
  }

  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[req:derive] Wrote ${summary.files.length} files + summary.json`);
}

await main();
