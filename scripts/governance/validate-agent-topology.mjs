import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const activeDir = path.join(repoRoot, '.github', 'agents');

const expectedUserInvocable = new Map([
  ['mansoni.agent.md', true],
  ['mansoni-core.agent.md', true],
  ['ruflo.agent.md', true],
  ['mansoni-architect.agent.md', false],
  ['mansoni-debugger.agent.md', false],
  ['mansoni-devops.agent.md', false],
  ['mansoni-performance-engineer.agent.md', false],
  ['mansoni-reviewer.agent.md', false],
  ['mansoni-security-engineer.agent.md', false],
  ['mansoni-tester.agent.md', false],
]);

const activeTools = new Set([
  'execute',
  'read',
  'edit',
  'search',
  'agent',
  'web',
  'todo',
  'claude-flow/*',
]);

const forbiddenTools = new Set(['vscode_askQuestions']);
const forbiddenToolPrefixes = ['vscode_', 'read_file', 'write_file', 'file_search', 'grep_search', 'semantic_search', 'run_in_terminal', 'manage_todo_list'];

function fail(message) {
  console.error(`AGENT_TOPOLOGY_ERROR: ${message}`);
  process.exitCode = 1;
}

function extractFrontmatter(content, filePath) {
  const normalized = content.replace(/^\uFEFF/, '');

  if (!normalized.startsWith('---')) {
    fail(`${filePath} is missing YAML frontmatter opening delimiter`);
    return '';
  }

  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    fail(`${filePath} is missing YAML frontmatter closing delimiter`);
    return '';
  }

  return match[1];
}

function parseFrontmatter(frontmatter) {
  const result = {};
  let currentListKey = null;

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '    ');
    if (!line.trim()) {
      continue;
    }

    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentListKey) {
      result[currentListKey].push(listMatch[1].trim());
      continue;
    }

    const scalarMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!scalarMatch) {
      currentListKey = null;
      continue;
    }

    const [, key, value] = scalarMatch;
    if (value === '') {
      result[key] = [];
      currentListKey = key;
      continue;
    }

    currentListKey = null;
    result[key] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }

  return result;
}

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseFrontmatter(extractFrontmatter(content, filePath));
}

function listAgentFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.agent.md'))
    .map((entry) => entry.name)
    .sort();
}

function validateFlatAgentDirectory(dirPath) {
  const subdirectories = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (subdirectories.length > 0) {
    fail(`agent directory must stay flat: ${dirPath}; found subdirectories [${subdirectories.join(', ')}]`);
  }
}

function validateActiveAgents() {
  const files = listAgentFiles(activeDir);
  const expectedFiles = [...expectedUserInvocable.keys()].sort();

  if (files.length !== expectedFiles.length || files.some((file, index) => file !== expectedFiles[index])) {
    fail(`active agent set drifted. expected [${expectedFiles.join(', ')}], got [${files.join(', ')}]`);
  }

  for (const fileName of files) {
    const filePath = path.join(activeDir, fileName);
    const frontmatter = readFrontmatter(filePath);
    const expectedFlag = String(expectedUserInvocable.get(fileName));
    const actualFlag = String(frontmatter['user-invocable']);

    if (actualFlag !== expectedFlag) {
      fail(`${fileName} has user-invocable=${actualFlag}, expected ${expectedFlag}`);
    }

    const tools = Array.isArray(frontmatter.tools) ? frontmatter.tools : [];
    for (const tool of tools) {
      if (!activeTools.has(tool)) {
        fail(`${fileName} uses unsupported active tool '${tool}'`);
      }
      if (forbiddenTools.has(tool) || forbiddenToolPrefixes.some((prefix) => tool === prefix || tool.startsWith(prefix))) {
        fail(`${fileName} uses forbidden tool '${tool}'`);
      }
    }
  }
}

if (!fs.existsSync(activeDir)) {
  fail(`active agents directory is missing: ${activeDir}`);
}

for (const agentDir of [
  activeDir,
  path.join(repoRoot, '.claude', 'agents'),
]) {
  if (fs.existsSync(agentDir) && fs.statSync(agentDir).isDirectory()) {
    validateFlatAgentDirectory(agentDir);
  }
}

validateActiveAgents();

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Agent topology validation passed.');