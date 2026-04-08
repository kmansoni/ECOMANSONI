const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const action = process.argv[2] || 'status';

function argText(fromIndex = 3) {
  return process.argv
    .slice(fromIndex)
    .join(' ')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : process.cwd();
}

function now() {
  return new Date().toISOString();
}

function bashEvidenceFor(command) {
  const normalized = String(command || '').toLowerCase();

  if (!normalized) return null;

  if (normalized.includes('tsc -p tsconfig.app.json --noemit')) {
    return {
      kind: 'tsc',
      summary: 'typecheck command completed via bash hook',
    };
  }

  if (normalized.includes('npm run lint') || normalized.includes('eslint')) {
    return {
      kind: 'lint',
      summary: 'lint command completed via bash hook',
    };
  }

  if (
    normalized.includes('vitest') ||
    normalized.includes('playwright test') ||
    normalized.includes('npm test') ||
    normalized.includes('pnpm test')
  ) {
    return {
      kind: 'tests',
      summary: 'test command completed via bash hook',
    };
  }

  return null;
}

function recordEvidence(projectDir, kind, summary) {
  const workflowContextScript = path.join(projectDir, '.claude', 'helpers', 'workflow-context.cjs');
  return spawnSync(process.execPath, [workflowContextScript, 'evidence', kind, summary], {
    cwd: projectDir,
    encoding: 'utf8',
    env: process.env,
  });
}

async function ensureFile(filePath, content) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, 'utf8');
  }
}

async function appendFile(filePath, content) {
  await fs.appendFile(filePath, content, 'utf8');
}

async function ensureScaffold(projectDir) {
  const swarmDir = path.join(projectDir, 'memories', 'session', 'swarm');
  await fs.mkdir(swarmDir, { recursive: true });

  const stateFile = path.join(swarmDir, 'state.md');
  const findingsFile = path.join(swarmDir, 'findings.md');
  const decisionsFile = path.join(swarmDir, 'decisions.md');
  const blockersFile = path.join(swarmDir, 'blockers.md');
  const eventsFile = path.join(swarmDir, 'events.log');

  await ensureFile(
    stateFile,
    [
      '# Swarm State',
      '',
      '- Namespace: mansoni-swarm',
      '- Canonical entrypoint: mansoni',
      '- Runtime layer: ruflo',
      '- Quality layer: mansoni',
      `- Initialized: ${now()}`,
      '- Last action: bootstrap',
      '',
      '## Canonical Docs',
      '',
      '- docs/orchestrator-system/architecture/RUFLO_INSIDE_MANSONI.md',
      '- .github/agents/mansoni.agent.md',
      '- .github/agents/ruflo.agent.md',
      '',
    ].join('\n'),
  );

  await ensureFile(findingsFile, '# Findings\n\n');
  await ensureFile(decisionsFile, '# Decisions\n\n');
  await ensureFile(blockersFile, '# Blockers\n\n');
  await ensureFile(eventsFile, '');

  return { swarmDir, stateFile, findingsFile, decisionsFile, blockersFile, eventsFile };
}

async function updateStateLine(stateFile, nextAction) {
  const content = await fs.readFile(stateFile, 'utf8');
  const updated = content
    .replace(/- Last action: .*$/m, `- Last action: ${nextAction}`)
    .replace(/- Initialized: .*$/m, (match) => match);
  await fs.writeFile(stateFile, updated, 'utf8');
}

async function registerEvent(files, kind, detail = '') {
  const suffix = detail ? ` | ${detail}` : '';
  await appendFile(files.eventsFile, `[${now()}] ${kind}${suffix}\n`);
  await updateStateLine(files.stateFile, `${kind}${suffix}`);
}

async function registerDecision(files, text) {
  await appendFile(files.decisionsFile, `- ${now()} | ${text}\n`);
}

async function handleSessionRestore(files, projectDir) {
  await registerEvent(files, 'session-restore', `project=${path.basename(projectDir)}`);
  await registerDecision(files, 'session restored into mansoni-swarm namespace');

  const workflowContextScript = path.join(projectDir, '.claude', 'helpers', 'workflow-context.cjs');
  spawnSync(process.execPath, [workflowContextScript, 'reset'], {
    cwd: projectDir,
    encoding: 'utf8',
    env: process.env,
  });

  process.stdout.write('mansoni-swarm restored\n');
}

async function handlePreTask(files, projectDir) {
  const description = argText(3);
  await registerEvent(files, 'pre-task', description ? `description=${description}` : 'description=unknown');

  const workflowContextScript = path.join(projectDir, '.claude', 'helpers', 'workflow-context.cjs');
  const result = spawnSync(process.execPath, [workflowContextScript, 'task-intent', 'pre', description], {
    cwd: projectDir,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status === 0) {
    const payload = JSON.parse((result.stdout || '{}').trim() || '{}');
    const workflow = payload.workflow || 'general';
    const verdict = payload.reviewVerdict || 'PENDING';
    await registerDecision(files, `task workflow auto-classified: ${workflow} | verdict=${verdict}`);
    process.stdout.write(workflow);
    return;
  }

  const errorText = (result.stderr || result.stdout || 'workflow inference failed').trim();
  await appendFile(files.blockersFile, `- ${now()} | workflow inference failed | ${errorText}\n`);
}

async function handleSessionEnd(files) {
  await registerEvent(files, 'session-end');
  await registerDecision(files, 'session closed cleanly');
}

async function handlePostTask(files, source = 'post-task') {
  await registerEvent(files, source);
  await registerDecision(files, 'task lifecycle completed');

  const projectDir = getProjectDir();
  const description = source === 'post-task-tool' ? argText(3) : '';
  if (description) {
    const workflowContextScript = path.join(projectDir, '.claude', 'helpers', 'workflow-context.cjs');
    const intentResult = spawnSync(process.execPath, [workflowContextScript, 'task-intent', 'post', description], {
      cwd: projectDir,
      encoding: 'utf8',
      env: process.env,
    });

    if (intentResult.status === 0) {
      const payload = JSON.parse((intentResult.stdout || '{}').trim() || '{}');
      await registerDecision(
        files,
        `task post-intent synced: workflow=${payload.workflow || 'general'} | verdict=${payload.reviewVerdict || 'PENDING'}`,
      );
    }
  }

  const verificationScript = path.join(projectDir, '.claude', 'helpers', 'verification-gate.cjs');
  const result = spawnSync(process.execPath, [verificationScript], {
    cwd: projectDir,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status === 0) {
    const verdict = (result.stdout || '').trim() || 'RISKY';
    await registerDecision(files, `verification fusion verdict: ${verdict}`);
    return;
  }

  const errorText = (result.stderr || result.stdout || 'verification gate failed').trim();
  await appendFile(files.blockersFile, `- ${now()} | verification gate failed | ${errorText}\n`);
}

async function handleCompact(files, mode) {
  await registerEvent(files, `compact-${mode}`);
}

async function handleStatus(files) {
  await registerEvent(files, 'status');
  process.stdout.write('mansoni|ruflo|mansoni-swarm\n');
}

async function handlePostBash(files, projectDir) {
  const command = argText(3);
  await registerEvent(files, 'post-bash', command ? `command=${command}` : 'command=unknown');

  const evidence = bashEvidenceFor(command);
  if (!evidence) {
    return;
  }

  const result = recordEvidence(projectDir, evidence.kind, evidence.summary);
  if (result.status === 0) {
    await registerDecision(files, `bash evidence captured: ${evidence.kind}`);
    return;
  }

  const errorText = (result.stderr || result.stdout || 'bash evidence capture failed').trim();
  await appendFile(files.blockersFile, `- ${now()} | bash evidence capture failed | ${errorText}\n`);
}

async function handlePreBash(files) {
  const command = argText(3);
  await registerEvent(files, 'pre-bash', command ? `command=${command}` : 'command=unknown');
}

async function main() {
  const projectDir = getProjectDir();
  const files = await ensureScaffold(projectDir);

  switch (action) {
    case 'session-restore':
      await handleSessionRestore(files, projectDir);
      return;
    case 'session-end':
      await handleSessionEnd(files);
      return;
    case 'pre-task':
      await handlePreTask(files, projectDir);
      return;
    case 'post-task':
      await handlePostTask(files, 'post-task');
      return;
    case 'post-task-tool':
      await handlePostTask(files, 'post-task-tool');
      return;
    case 'compact-manual':
      await handleCompact(files, 'manual');
      return;
    case 'compact-auto':
      await handleCompact(files, 'auto');
      return;
    case 'status':
      await handleStatus(files);
      return;
    case 'pre-bash':
      await handlePreBash(files);
      return;
    case 'post-bash':
      await handlePostBash(files, projectDir);
      return;
    case 'pre-edit':
    case 'post-edit':
      await registerEvent(files, action);
      return;
    default:
      await registerEvent(files, 'unknown-action', action);
      return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});