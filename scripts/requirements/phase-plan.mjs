import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REQUIREMENTS_PATH = path.join(ROOT, "docs", "requirements", "telegram-500.yaml");
const OVERRIDES_PATH = path.join(ROOT, "docs", "requirements", "phase-overrides.json");
const OUT_MD = path.join(ROOT, "docs", "requirements", "phase-execution-report.md");
const OUT_JSON = path.join(ROOT, "docs", "requirements", "phase-execution-report.json");

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => s.trim())
      .map((s) => {
        if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
        return s;
      });
  }
  return value;
}

function parseYamlVeryLight(text) {
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("  - id:")) {
      if (current) tasks.push(current);
      current = { id: Number(line.split(":")[1].trim()) };
      continue;
    }

    if (!current) continue;

    const m = line.match(/^\s{4}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) continue;

    const key = m[1];
    current[key] = parseScalar(m[2]);
  }

  if (current) tasks.push(current);
  return tasks;
}

async function readOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return new Map();
  const raw = JSON.parse(await readFile(OVERRIDES_PATH, "utf8"));
  const list = Array.isArray(raw?.overrides) ? raw.overrides : [];
  const map = new Map();
  for (const item of list) {
    if (item?.req_id) map.set(item.req_id, item);
  }
  return map;
}

function getPhase(taskId) {
  if (taskId >= 1 && taskId <= 140) return { id: "phase0", title: "Phase 0 - Core Messaging & Feed Foundation" };
  if (taskId >= 141 && taskId <= 280) return { id: "phase1", title: "Phase 1 - PMF: Groups/Channels/Safety" };
  if (taskId >= 281 && taskId <= 380) return { id: "phase2", title: "Phase 2 - Monetization & Growth Readiness" };
  if (taskId >= 381 && taskId <= 450) return { id: "phase3", title: "Phase 3 - Scale, Reliability, Compliance" };
  return { id: "phase4", title: "Phase 4 - Super-platform Expansion" };
}

function reqIdToTask(reqId, byReqId) {
  if (!reqId || typeof reqId !== "string") return null;
  return byReqId.get(reqId) ?? null;
}

function phaseOrder(phaseId) {
  return ["phase0", "phase1", "phase2", "phase3", "phase4"].indexOf(phaseId);
}

function statusOrder(status) {
  if (status === "in-progress") return 0;
  if (status === "todo") return 1;
  if (status === "done") return 2;
  return 3;
}

function priorityOrder(priority) {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  return 3;
}

async function main() {
  const yaml = await readFile(REQUIREMENTS_PATH, "utf8");
  const tasks = parseYamlVeryLight(yaml);
  const overrides = await readOverrides();

  const merged = tasks.map((task) => {
    const ov = overrides.get(task.req_id) ?? null;
    if (!ov) return task;
    return {
      ...task,
      title: ov.title ?? task.title,
      status: ov.status ?? task.status,
      domain_id: ov.domain_id ?? task.domain_id,
      deliverable: ov.deliverable ?? task.deliverable,
      deps: Array.isArray(ov.deps) ? ov.deps : task.deps,
    };
  });

  const byReqId = new Map();
  for (const task of merged) {
    if (typeof task.req_id === "string") byReqId.set(task.req_id, task);
  }

  const enriched = merged.map((task) => {
    const phase = getPhase(task.id);
    const deliverable = typeof task.deliverable === "string" ? task.deliverable : null;
    const deliverableExists = deliverable ? existsSync(path.join(ROOT, deliverable)) : false;

    const depReqs = Array.isArray(task.deps) ? task.deps : [];
    const unresolvedDeps = depReqs.filter((depReqId) => {
      const depTask = reqIdToTask(depReqId, byReqId);
      if (!depTask) return true;
      return depTask.status !== "done";
    });

    return {
      ...task,
      phase,
      deliverable,
      deliverableExists,
      unresolvedDeps,
      blocked: unresolvedDeps.length > 0,
      needsRepair: task.status === "done" && Boolean(deliverable) && !deliverableExists,
      titleNeedsSpec: typeof task.title === "string" && task.title.includes("TBD"),
    };
  });

  const byPhase = new Map();
  for (const t of enriched) {
    const row = byPhase.get(t.phase.id) ?? {
      phaseId: t.phase.id,
      phaseTitle: t.phase.title,
      total: 0,
      done: 0,
      inProgress: 0,
      todo: 0,
      blocked: 0,
      needsRepair: 0,
      tbdTitles: 0,
    };

    row.total += 1;
    if (t.status === "done") row.done += 1;
    else if (t.status === "in-progress") row.inProgress += 1;
    else row.todo += 1;

    if (t.blocked && t.status !== "done") row.blocked += 1;
    if (t.needsRepair) row.needsRepair += 1;
    if (t.titleNeedsSpec) row.tbdTitles += 1;

    byPhase.set(t.phase.id, row);
  }

  const nextQueue = enriched
    .filter((t) => t.status !== "done" && !t.blocked)
    .sort((a, b) => {
      const p = phaseOrder(a.phase.id) - phaseOrder(b.phase.id);
      if (p !== 0) return p;
      const s = statusOrder(a.status) - statusOrder(b.status);
      if (s !== 0) return s;
      const pr = priorityOrder(a.priority) - priorityOrder(b.priority);
      if (pr !== 0) return pr;
      return a.id - b.id;
    })
    .slice(0, 40);

  const repairQueue = enriched.filter((t) => t.needsRepair).sort((a, b) => a.id - b.id).slice(0, 30);
  const blockedQueue = enriched.filter((t) => t.status !== "done" && t.blocked).sort((a, b) => a.id - b.id).slice(0, 30);
  const specQueue = enriched.filter((t) => t.status !== "done" && t.titleNeedsSpec).sort((a, b) => a.id - b.id).slice(0, 30);

  const totals = {
    total: enriched.length,
    done: enriched.filter((t) => t.status === "done").length,
    inProgress: enriched.filter((t) => t.status === "in-progress").length,
    todo: enriched.filter((t) => t.status === "todo").length,
    blocked: enriched.filter((t) => t.status !== "done" && t.blocked).length,
    needsRepair: enriched.filter((t) => t.needsRepair).length,
    tbdTitles: enriched.filter((t) => t.titleNeedsSpec).length,
    overridesApplied: overrides.size,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    source: "docs/requirements/telegram-500.yaml",
    overrides: existsSync(OVERRIDES_PATH) ? "docs/requirements/phase-overrides.json" : null,
    totals,
    phases: [...byPhase.values()].sort((a, b) => phaseOrder(a.phaseId) - phaseOrder(b.phaseId)),
    nextQueue,
    repairQueue,
    blockedQueue,
    specQueue,
  };

  const md = [
    "# Phase Execution Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Totals",
    "",
    `- Total functions: **${totals.total}**`,
    `- Done: **${totals.done}**`,
    `- In progress: **${totals.inProgress}**`,
    `- Todo: **${totals.todo}**`,
    `- Blocked (not done): **${totals.blocked}**`,
    `- Done but missing deliverable file (needs repair): **${totals.needsRepair}**`,
    `- Tasks still with TBD title: **${totals.tbdTitles}**`,
    `- Overrides applied: **${totals.overridesApplied}**`,
    "",
    "## By Phase",
    "",
    "| Phase | Total | Done | In progress | Todo | Blocked | Needs repair | TBD titles |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.phases.map((p) => `| ${p.phaseTitle} | ${p.total} | ${p.done} | ${p.inProgress} | ${p.todo} | ${p.blocked} | ${p.needsRepair} | ${p.tbdTitles} |`),
    "",
    "## Next Execution Queue (Unblocked, top 40)",
    "",
    "| ID | Req | Title | Phase | Priority | Status | Deliverable |",
    "|---:|---|---|---|---|---|---|",
    ...nextQueue.map((t) => `| ${t.id} | ${t.req_id ?? "-"} | ${t.title ?? "-"} | ${t.phase.id} | ${t.priority ?? "-"} | ${t.status} | ${t.deliverable ?? "-"} |`),
    "",
    "## Repair Queue (status=done, deliverable missing)",
    "",
    repairQueue.length === 0
      ? "No repair items."
      : [
          "| ID | Req | Deliverable |",
          "|---:|---|---|",
          ...repairQueue.map((t) => `| ${t.id} | ${t.req_id ?? "-"} | ${t.deliverable ?? "-"} |`),
        ].join("\n"),
    "",
    "## Spec Queue (TBD titles, top 30)",
    "",
    specQueue.length === 0
      ? "No TBD title items in active queue."
      : [
          "| ID | Req | Title |",
          "|---:|---|---|",
          ...specQueue.map((t) => `| ${t.id} | ${t.req_id ?? "-"} | ${t.title ?? "-"} |`),
        ].join("\n"),
    "",
    "## Blocked Queue (top 30)",
    "",
    blockedQueue.length === 0
      ? "No blocked items."
      : [
          "| ID | Req | Status | Unresolved deps |",
          "|---:|---|---|---|",
          ...blockedQueue.map((t) => `| ${t.id} | ${t.req_id ?? "-"} | ${t.status} | ${(t.unresolvedDeps ?? []).join(", ")} |`),
        ].join("\n"),
    "",
    "## Execution Rules",
    "",
    "1. Skip all `done` items unless they are in Repair Queue.",
    "2. Execute only unblocked items from earliest phase first.",
    "3. Keep idempotency, server-side enforcement, and D0.000 as mandatory gates.",
  ].join("\n");

  await writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  await writeFile(OUT_MD, md, "utf8");

  console.log(`[req:phase] Wrote ${path.relative(ROOT, OUT_MD)} and ${path.relative(ROOT, OUT_JSON)}`);
}

await main();


