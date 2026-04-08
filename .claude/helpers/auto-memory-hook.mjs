import fs from 'fs/promises';
import path from 'path';

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : process.cwd();
}

function now() {
  return new Date().toISOString();
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const command = process.argv[2] || 'import';
  const projectDir = getProjectDir();
  const swarmDir = path.join(projectDir, 'memories', 'session', 'swarm');
  const repoIndex = path.join(projectDir, 'memories', 'repo', 'index.md');
  const contextFile = path.join(swarmDir, 'context.md');

  await ensureDir(swarmDir);

  if (command !== 'import') {
    process.stdout.write(`unsupported:${command}\n`);
    return;
  }

  const repoIndexContent = await readIfExists(repoIndex);
  const content = [
    '# Imported Context',
    '',
    `- Imported: ${now()}`,
    '- Namespace: mansoni-swarm',
    '- Canonical entrypoint: mansoni',
    '- Runtime layer: ruflo',
    '',
    '## Canonical References',
    '',
    '- docs/orchestrator-system/architecture/RUFLO_INSIDE_MANSONI.md',
    '- .github/agents/mansoni.agent.md',
    '- .github/agents/ruflo.agent.md',
    '',
    '## Repo Memory Index Snapshot',
    '',
    repoIndexContent || '_repo memory index is empty_',
    '',
  ].join('\n');

  await fs.writeFile(contextFile, content, 'utf8');
  process.stdout.write('memory imported\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});