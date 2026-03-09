#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const softFail = process.argv.includes("--soft-fail");
const root = process.cwd();
const reportDir = path.join(root, "tmp", "diagnostics");
mkdirSync(reportDir, { recursive: true });

const now = new Date();
const iso = now.toISOString();
const stamp = iso.replace(/[:.]/g, "-");

/** @type {Array<{name: string, command: string, args: string[], requiresSupabaseCreds?: boolean}>} */
const checks = [
  { name: "Encoding BOM guard", command: "npm", args: ["run", "encoding:check-bom"] },
  { name: "ESLint", command: "npm", args: ["run", "lint"] },
  { name: "SQL RPC alias lint", command: "npm", args: ["run", "sql:lint"] },
  { name: "Backend migration safety", command: "npm", args: ["run", "check:backend"] },
  { name: "Core tests", command: "npm", args: ["run", "test:core"], requiresSupabaseCreds: true },
  { name: "Dev build", command: "npm", args: ["run", "build:dev"] },
  { name: "Python syntax compileall", command: "python", args: ["-m", "compileall", "-q", "ai_engine", "navigation_server"] },
  { name: "Supabase function payload tests", command: "deno", args: ["test", "supabase/functions/email-send/validation_test.ts"] },
];

function isPlaceholder(value) {
  if (!value) return true;
  return /placeholder|example\.supabase\.co/i.test(value);
}

function hasSupabaseCreds() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key && !isPlaceholder(url) && !isPlaceholder(key));
}

function resolveCommand(command) {
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  if (command === "python") return "python.exe";
  if (command === "deno") return "deno.exe";
  return command;
}

function quoteArg(value) {
  const s = String(value);
  if (!/[\s"]/u.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function classifyFailure(result) {
  if (result.ok || result.skipped) return result.failureClass;
  const output = `${result.stdout}\n${result.stderr}`;
  if (/Invalid API key|missing.*(env|secret|key)|requires.*(token|secret|credential)/i.test(output)) {
    return "env";
  }
  if (/not recognized|is not recognized as an internal or external command|�� ���� ����७���|ENOENT/i.test(output)) {
    return "tooling";
  }
  return "code";
}

function runCheck(check) {
  return new Promise((resolve) => {
    if (check.requiresSupabaseCreds && !hasSupabaseCreds()) {
      resolve({
        ...check,
        ok: false,
        skipped: true,
        exitCode: 0,
        durationMs: 0,
        stdout: "",
        stderr: "",
        failureClass: "env",
        note: "Missing Supabase credentials (VITE_SUPABASE_URL + anon/publishable key)",
      });
      return;
    }

    const start = Date.now();
    const env = {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "diag-placeholder-key",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "diag-placeholder-key",
    };

    const child = process.platform === "win32"
      ? spawn(
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `${quoteArg(resolveCommand(check.command))} ${check.args.map(quoteArg).join(" ")}`,
        ],
        { cwd: root, shell: false, env },
      )
      : spawn(resolveCommand(check.command), check.args, { cwd: root, shell: false, env });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      const text = String(buf);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (buf) => {
      const text = String(buf);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolve({
        ...check,
        ok: false,
        skipped: true,
        exitCode: -1,
        durationMs: Date.now() - start,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        failureClass: "tooling",
        note: "Tool missing or not runnable",
      });
    });

    child.on("close", (exitCode) => {
      const base = {
        ...check,
        ok: exitCode === 0,
        skipped: false,
        exitCode: exitCode ?? -1,
        durationMs: Date.now() - start,
        stdout,
        stderr,
        failureClass: exitCode === 0 ? "none" : "code",
        note: "",
      };
      resolve({
        ...base,
        failureClass: classifyFailure(base),
      });
    });
  });
}

function toMarkdown(results, durationMs) {
  const lines = [];
  lines.push("# 24x7 Diagnostics Report");
  lines.push("");
  lines.push(`- Time (UTC): ${iso}`);
  lines.push(`- Duration: ${(durationMs / 1000).toFixed(1)}s`);
  lines.push(`- Soft fail mode: ${softFail ? "enabled" : "disabled"}`);
  lines.push("");
  lines.push("| Check | Status | Class | Exit | Duration | Note |");
  lines.push("|---|---|---|---:|---:|---|");

  for (const result of results) {
    const status = result.ok ? "PASS" : (result.skipped ? "SKIP" : "FAIL");
    const klass = result.failureClass === "none" ? "-" : result.failureClass;
    const note = result.note
      || (result.failureClass === "tooling" ? "Missing local toolchain component (see JSON logs)" : "")
      || (result.failureClass === "env" ? "Missing/invalid required environment configuration" : "")
      || (result.ok ? "" : "See JSON artifact logs");
    lines.push(`| ${result.name} | ${status} | ${klass} | ${result.exitCode} | ${(result.durationMs / 1000).toFixed(1)}s | ${note} |`);
  }

  const failed = results.filter((r) => !r.ok && !r.skipped && r.failureClass === "code").length;
  const envFailed = results.filter((r) => !r.ok && r.failureClass === "env").length;
  const toolingFailed = results.filter((r) => !r.ok && r.failureClass === "tooling").length;
  const skipped = results.filter((r) => r.skipped).length;
  lines.push("");
  lines.push(`- Code failed checks: ${failed}`);
  lines.push(`- Env-related checks: ${envFailed}`);
  lines.push(`- Tooling checks: ${toolingFailed}`);
  lines.push(`- Skipped checks: ${skipped}`);
  return lines.join("\n");
}

async function main() {
  const started = Date.now();
  const results = [];

  for (const check of checks) {
    console.log(`\n=== ${check.name} ===`);
    const result = await runCheck(check);
    results.push(result);
  }

  const durationMs = Date.now() - started;
  const report = {
    timestampUtc: iso,
    durationMs,
    softFail,
    summary: {
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && !r.skipped && r.failureClass === "code").length,
      envFailed: results.filter((r) => !r.ok && r.failureClass === "env").length,
      toolingFailed: results.filter((r) => !r.ok && r.failureClass === "tooling").length,
      skipped: results.filter((r) => r.skipped).length,
    },
    results,
  };

  const jsonPath = path.join(reportDir, `report-${stamp}.json`);
  const latestJsonPath = path.join(reportDir, "latest.json");
  const mdPath = path.join(reportDir, `report-${stamp}.md`);
  const latestMdPath = path.join(reportDir, "latest.md");

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), "utf8");

  const markdown = toMarkdown(results, durationMs);
  writeFileSync(mdPath, markdown, "utf8");
  writeFileSync(latestMdPath, markdown, "utf8");

  console.log(`\nDiagnostics report: ${latestJsonPath}`);
  const failedCount = report.summary.failed;

  if (failedCount > 0 && !softFail) {
    process.exitCode = 1;
  }
}

await main();
