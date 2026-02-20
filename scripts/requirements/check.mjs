import { readFile } from "node:fs/promises";
import path from "node:path";

const inPath = path.join(process.cwd(), "docs", "requirements", "telegram-500.yaml");

function parseYamlVeryLight(text) {
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

function fail(msg) {
  console.error("[req:check] " + msg);
  process.exit(1);
}

async function main() {
  const text = await readFile(inPath, "utf8");
  const tasks = parseYamlVeryLight(text);

  if (tasks.length !== 500) fail(`Expected 500 tasks, got ${tasks.length}`);

  const ids = new Set();
  for (const t of tasks) {
    if (!Number.isInteger(t.id) || t.id < 1 || t.id > 500) fail(`Invalid id: ${t.id}`);
    if (ids.has(t.id)) fail(`Duplicate id: ${t.id}`);
    ids.add(t.id);

    if (!t.req_id || typeof t.req_id !== "string") fail(`Missing req_id for id ${t.id}`);
    if (t.deprecated !== true && t.deprecated !== false) fail(`Missing deprecated boolean for id ${t.id}`);

    // Rule: cannot delete requirements, only deprecate.
    // (Enforced by: always require full 1..500 set present.)

    // Rule: minimum scenario derivatives.
    const min = Number(t.scenarios_min ?? 0);
    if (!Number.isFinite(min) || min < 15) fail(`scenarios_min must be >= 15 (id ${t.id})`);
  }

  // Domains sanity (>=30) if domains.json exists
  try {
    const domainsPath = path.join(process.cwd(), "docs", "requirements", "domains.json");
    const domains = JSON.parse(await readFile(domainsPath, "utf8"));
    const list = Array.isArray(domains?.domains) ? domains.domains : [];
    if (list.length < 30) fail(`Expected >=30 domains in domains.json, got ${list.length}`);
    const domainIds = new Set();
    for (const d of list) {
      if (!d?.domain_id || typeof d.domain_id !== "string") fail("domains.json: missing domain_id");
      if (domainIds.has(d.domain_id)) fail(`domains.json: duplicate domain_id ${d.domain_id}`);
      domainIds.add(d.domain_id);
    }
  } catch {
    // ignore if file missing/invalid JSON
  }

  console.log("[req:check] OK");
}

await main();
