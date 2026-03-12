#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BYPASS_VALUE = 'I_UNDERSTAND_E2EE_CHANGES';

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function getProtectedList() {
  const p = resolve(process.cwd(), 'scripts/security/e2ee-critical-files.txt');
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function getChangedFiles(mode) {
  if (mode === 'push') {
    try {
      const upstream = run('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
      const range = `${upstream}..HEAD`;
      const out = run(`git diff --name-only ${range}`);
      return out ? out.split(/\r?\n/).filter(Boolean) : [];
    } catch {
      // No upstream: fallback to staged set.
      const out = run('git diff --cached --name-only');
      return out ? out.split(/\r?\n/).filter(Boolean) : [];
    }
  }

  const out = run('git diff --cached --name-only');
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function main() {
  const mode = process.argv.includes('--mode=push') ? 'push' : 'commit';
  const bypass = process.env.E2EE_GUARD_BYPASS === BYPASS_VALUE;

  if (bypass) {
    console.log('[e2ee-critical-guard] bypass accepted via E2EE_GUARD_BYPASS.');
    process.exit(0);
  }

  const protectedFiles = getProtectedList();
  const changedFiles = getChangedFiles(mode);
  const touched = changedFiles.filter((f) => protectedFiles.includes(f));

  if (touched.length === 0) {
    process.exit(0);
  }

  console.error('\n[e2ee-critical-guard] BLOCKED: critical E2EE files changed:');
  touched.forEach((f) => console.error(` - ${f}`));
  console.error('\nIf this is intentional, re-run with:');
  console.error(`  E2EE_GUARD_BYPASS=${BYPASS_VALUE} <your git command>`);
  console.error('Also add [E2EE-ALLOW] token in commit message / PR title for CI override.\n');
  process.exit(1);
}

main();
