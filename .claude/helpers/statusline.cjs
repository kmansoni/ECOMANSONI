const fs = require('fs/promises');
const path = require('path');

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : process.cwd();
}

async function main() {
  const projectDir = getProjectDir();
  const stateFile = path.join(projectDir, 'memories', 'session', 'swarm', 'state.md');

  let action = 'idle';

  try {
    const content = await fs.readFile(stateFile, 'utf8');
    const match = content.match(/- Last action: (.*)$/m);
    if (match?.[1]) {
      action = match[1].trim();
    }
  } catch {
    action = 'bootstrapping';
  }

  process.stdout.write(`mansoni | ruflo adaptive | ${action}`);
}

main().catch(() => {
  process.stdout.write('mansoni | ruflo adaptive | error');
});