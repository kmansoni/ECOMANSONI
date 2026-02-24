import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", "supabase", "reserve", ".archive"].includes(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function isTextFile(file) {
  return /\.(ts|tsx|js|jsx|mjs|cjs|css|md|json|yml|yaml)$/i.test(file);
}

function scanRegex(files, re) {
  let count = 0;
  const hits = [];
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        count++;
        if (hits.length < 20) hits.push(`${rel}:${i + 1}`);
      }
    }
  }
  return { count, hits };
}

function statusFromCount(count, zeroIsPass = true) {
  if (zeroIsPass) return count === 0 ? "PASS" : "FAIL";
  return count > 0 ? "PASS" : "FAIL";
}

const allFiles = walk(root);
const codeFiles = allFiles.filter((f) => {
  const rel = path.relative(root, f).replace(/\\/g, "/");
  return (
    rel.startsWith("src/") ||
    rel.startsWith("apps/") ||
    rel.startsWith("packages/") ||
    rel.startsWith("services/") ||
    rel.startsWith("server/")
  );
});

const checks = [];

checks.push({
  code: "FP-UI-004",
  description: "UI public API boundary present (packages/ui + exports)",
  status: exists("packages/ui/package.json") && exists("packages/ui/src/index.ts") ? "PASS" : "FAIL",
  detail: exists("packages/ui/package.json") ? "packages/ui exists" : "packages/ui missing",
});

const legacyImport = scanRegex(codeFiles, /@\/components\/ui\/button/);
checks.push({
  code: "FP-UI-001A",
  description: "No new legacy imports (baseline visibility)",
  status: statusFromCount(legacyImport.count),
  detail: `${legacyImport.count} legacy imports found`,
  samples: legacyImport.hits,
});

const rawHex = scanRegex(
  codeFiles.filter((f) => !f.includes(`${path.sep}packages${path.sep}tokens${path.sep}`)),
  /#[0-9a-fA-F]{3,8}\b/
);
checks.push({
  code: "FP-UI-002",
  description: "No raw colors outside tokens",
  status: statusFromCount(rawHex.count),
  detail: `${rawHex.count} raw color occurrences`,
  samples: rawHex.hits,
});

const directStorage = scanRegex(
  codeFiles.filter((f) => !f.includes(`${path.sep}src${path.sep}test${path.sep}`)),
  /\b(localStorage|sessionStorage)\b/
);
checks.push({
  code: "FP-SEC-703A",
  description: "No direct Web Storage outside runtime wrapper",
  status: statusFromCount(directStorage.count),
  detail: `${directStorage.count} direct storage references`,
  samples: directStorage.hits,
});

const transportUsage = scanRegex(
  codeFiles.filter((f) => !f.includes(`${path.sep}src${path.sep}test${path.sep}`) && !f.includes(`${path.sep}e2e${path.sep}`)),
  /\b(fetch\(|new WebSocket|new EventSource|sendBeacon\()/
);
checks.push({
  code: "FP-ARCH-503A",
  description: "Transport usage only in DAL/runtime",
  status: statusFromCount(transportUsage.count),
  detail: `${transportUsage.count} direct transport usages`,
  samples: transportUsage.hits,
});

checks.push({
  code: "FP-GOV-8001B",
  description: "Branch protection contract exists",
  status: exists("docs/ci/branch-protection.md") ? "PASS" : "FAIL",
  detail: exists("docs/ci/branch-protection.md") ? "present" : "missing",
});

checks.push({
  code: "FP-MIG-901",
  description: "Stage control SSOT exists",
  status: exists("docs/migration/stage.json") ? "PASS" : "FAIL",
  detail: exists("docs/migration/stage.json") ? "present" : "missing",
});

checks.push({
  code: "FP-MIG-9102",
  description: "Flows SSOT exists",
  status: exists("docs/migration/flows.json") ? "PASS" : "FAIL",
  detail: exists("docs/migration/flows.json") ? "present" : "missing",
});

checks.push({
  code: "ROUTEMAP-001",
  description: "Route-map SSOT exists",
  status: exists("docs/migration/route-map.json") ? "PASS" : "FAIL",
  detail: exists("docs/migration/route-map.json") ? "present" : "missing",
});

const summary = {
  generatedAt: new Date().toISOString(),
  checks,
  totals: {
    pass: checks.filter((c) => c.status === "PASS").length,
    fail: checks.filter((c) => c.status === "FAIL").length,
  },
};

fs.mkdirSync(path.join(root, ".ci"), { recursive: true });
fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
fs.writeFileSync(path.join(root, ".ci", "frontend-platform-baseline.json"), JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# Frontend Platform Baseline");
lines.push("");
lines.push(`Generated: ${summary.generatedAt}`);
lines.push("");
lines.push("## Summary");
lines.push(`- PASS: ${summary.totals.pass}`);
lines.push(`- FAIL: ${summary.totals.fail}`);
lines.push("");
lines.push("## Check Results");
for (const c of checks) {
  lines.push(`- ${c.code} | ${c.status} | ${c.description} | ${c.detail}`);
  if (c.samples && c.samples.length) {
    lines.push(`  Samples: ${c.samples.join(", ")}`);
  }
}
lines.push("");
lines.push("## Gap Priority");
lines.push("- P0: create canonical UI/tokens/runtime/contracts packages and boundary gates.");
lines.push("- P1: migrate legacy button imports and direct transport/storage usage.");
lines.push("- P2: enable staged required checks (S0 -> S1 -> S2).");

fs.writeFileSync(path.join(root, "docs", "governance", "frontend-platform-baseline.md"), lines.join("\n"));
console.log("Baseline report generated:");
console.log(" - .ci/frontend-platform-baseline.json");
console.log(" - docs/governance/frontend-platform-baseline.md");
