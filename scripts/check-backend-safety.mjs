import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const ALLOW_MARKER = "ALLOW_DESTRUCTIVE_MIGRATION";

const DANGEROUS_PATTERNS = [
  { name: "DROP TABLE", re: /\bdrop\s+table\b/i },
  { name: "TRUNCATE", re: /\btruncate\s+table\b|\btruncate\b/i },
  { name: "DROP COLUMN", re: /\balter\s+table\b[\s\S]*?\bdrop\s+column\b/i },
  { name: "DELETE WITHOUT WHERE", re: /\bdelete\s+from\b(?![\s\S]*?\bwhere\b)/i },
];

function stripSqlComments(sql) {
  // Remove /* ... */ comments
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove -- ... comments
  out = out.replace(/--.*$/gm, "");
  return out;
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (e) {
    console.error(`[backend-safety] Cannot read migrations dir: ${migrationsDir}`);
    console.error(e);
    process.exit(2);
  }

  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".sql"))
    .map((e) => e.name)
    .sort();

  const violations = [];

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const raw = await readFile(filePath, "utf8");

    if (raw.includes(ALLOW_MARKER)) continue;

    const sql = stripSqlComments(raw);

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.re.test(sql)) {
        violations.push({ file, pattern: pattern.name });
      }
    }
  }

  if (violations.length) {
    console.error("[backend-safety] Destructive migration detected.");
    console.error(`Add '-- ${ALLOW_MARKER}' to the migration file if intentional.`);
    for (const v of violations) {
      console.error(`- ${v.file}: ${v.pattern}`);
    }
    process.exit(1);
  }

  console.log(`[backend-safety] OK (${files.length} migration file(s) checked)`);
}

await main();
