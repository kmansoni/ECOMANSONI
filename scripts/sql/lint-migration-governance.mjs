import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const ALLOW_MARKER = "ALLOW_NON_IDEMPOTENT_POLICY_DDL";

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function lineColFromIndex(text, index) {
  const upTo = text.slice(0, index);
  const lines = upTo.split("\n");
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function stripCommentsPreserveNewlines(sql) {
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
  return out;
}

function normalizeSqlIdent(raw) {
  return raw.replace(/"/g, "").replace(/\s+/g, "").toLowerCase();
}

function getAllMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function getVersionFromName(fileName) {
  const m = /^(\d+)_/.exec(fileName);
  return m ? m[1] : "";
}

function getChangedMigrationFiles() {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: ROOT, stdio: "ignore" });
  } catch {
    return null;
  }

  let range = "";

  if (process.env.GITHUB_EVENT_NAME === "pull_request" && process.env.GITHUB_BASE_REF) {
    const baseRef = process.env.GITHUB_BASE_REF.trim();
    try {
      execSync(`git fetch --no-tags --depth=1 origin ${baseRef}`, { cwd: ROOT, stdio: "ignore" });
    } catch {
      // Best effort only.
    }
    range = `origin/${baseRef}...HEAD`;
  } else if (
    process.env.GITHUB_EVENT_BEFORE &&
    process.env.GITHUB_SHA &&
    !/^0+$/.test(process.env.GITHUB_EVENT_BEFORE)
  ) {
    range = `${process.env.GITHUB_EVENT_BEFORE}..${process.env.GITHUB_SHA}`;
  } else {
    try {
      execSync("git rev-parse --verify HEAD~1", { cwd: ROOT, stdio: "ignore" });
      range = "HEAD~1..HEAD";
    } catch {
      return null;
    }
  }

  try {
    const out = execSync(`git diff --name-only --diff-filter=ACMR ${range} -- supabase/migrations/*.sql`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return out
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map(toPosix);
  } catch {
    return null;
  }
}

function checkDuplicateVersions(files) {
  const byVersion = new Map();

  for (const name of files) {
    const version = getVersionFromName(name);
    if (!version) continue;
    const arr = byVersion.get(version) ?? [];
    arr.push(name);
    byVersion.set(version, arr);
  }

  const violations = [];
  for (const [version, names] of byVersion.entries()) {
    if (names.length > 1) {
      violations.push({
        type: "duplicate-version",
        version,
        files: names,
      });
    }
  }

  return violations;
}

function checkPolicyIdempotence(fileRelPath) {
  const absPath = path.join(ROOT, fileRelPath);
  const raw = fs.readFileSync(absPath, "utf8");
  const cleaned = stripCommentsPreserveNewlines(raw);

  if (raw.includes(ALLOW_MARKER)) {
    return [];
  }

  const violations = [];

  const ifNotExistsRe = /create\s+policy\s+if\s+not\s+exists\b/gim;
  let m;
  while ((m = ifNotExistsRe.exec(cleaned)) !== null) {
    const { line, col } = lineColFromIndex(raw, m.index);
    violations.push({
      type: "policy-if-not-exists",
      file: fileRelPath,
      line,
      col,
      message: "CREATE POLICY IF NOT EXISTS is not portable across target Postgres/Supabase versions.",
    });
  }

  const dropRe = /drop\s+policy\s+if\s+exists\s+("[^"]+"|[a-z_][\w$]*)\s+on\s+((?:"[^"]+"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gim;
  const createRe = /create\s+policy\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[a-z_][\w$]*)\s+on\s+((?:"[^"]+"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gim;

  const dropped = new Set();
  while ((m = dropRe.exec(cleaned)) !== null) {
    const policyName = normalizeSqlIdent(m[1]);
    const tableName = normalizeSqlIdent(m[2]);
    dropped.add(`${tableName}::${policyName}`);
  }

  while ((m = createRe.exec(cleaned)) !== null) {
    const policyName = normalizeSqlIdent(m[1]);
    const tableName = normalizeSqlIdent(m[2]);
    const key = `${tableName}::${policyName}`;

    if (!dropped.has(key)) {
      const { line, col } = lineColFromIndex(raw, m.index);
      violations.push({
        type: "policy-not-idempotent",
        file: fileRelPath,
        line,
        col,
        message: `CREATE POLICY ${m[1]} ON ${m[2]} should be paired with DROP POLICY IF EXISTS in the same migration.`,
      });
    }
  }

  return violations;
}

function main() {
  const files = getAllMigrationFiles();
  const duplicateViolations = checkDuplicateVersions(files);

  const changedOrNull = getChangedMigrationFiles();
  let policyTargets;
  let policyTargetSource;
  if (changedOrNull === null) {
    // Fail-closed: if diff cannot be resolved, lint all migrations instead of silently skipping checks.
    policyTargets = files.map((fileName) => toPosix(path.join("supabase", "migrations", fileName)));
    policyTargetSource = "all";
  } else {
    const changedMigrations = new Set(changedOrNull);
    policyTargets = files
      .filter((fileName) => {
        const rel = toPosix(path.join("supabase", "migrations", fileName));
        return changedMigrations.has(rel);
      })
      .map((fileName) => toPosix(path.join("supabase", "migrations", fileName)));
    policyTargetSource = "changed";
  }

  const policyViolations = policyTargets.flatMap((rel) => checkPolicyIdempotence(rel));

  if (duplicateViolations.length || policyViolations.length) {
    console.error("[migration-governance] FAILED");

    if (duplicateViolations.length) {
      console.error("\nDuplicate migration versions detected:");
      for (const v of duplicateViolations) {
        console.error(`- version ${v.version}: ${v.files.join(", ")}`);
      }
    }

    if (policyViolations.length) {
      console.error("\nNon-idempotent policy DDL detected:");
      for (const v of policyViolations) {
        console.error(`- ${v.file}:${v.line}:${v.col} ${v.message}`);
      }
      console.error(`\nIf intentional, add marker '-- ${ALLOW_MARKER}' to that migration with a rationale.`);
    }

    process.exit(1);
  }

  console.log(`[migration-governance] OK. Checked ${files.length} migration files for duplicate versions.`);
  if (policyTargetSource === "all") {
    console.log("[migration-governance] Policy idempotence: checked all migrations (diff unavailable, fail-closed mode).");
    return;
  }
  if (policyTargets.length === 0) {
    console.log("[migration-governance] Policy idempotence: no changed migrations detected in current diff.");
  } else {
    console.log(`[migration-governance] Policy idempotence: checked ${policyTargets.length} changed migration file(s).`);
  }
}

main();
