const fs = require('fs/promises');
const path = require('path');

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : process.cwd();
}

function now() {
  return new Date().toISOString();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkflow(contracts) {
  const workflowName = process.env.MANSONI_WORKFLOW || contracts.defaultWorkflow || 'general';
  return {
    name: workflowName,
    spec: contracts.workflows[workflowName] || contracts.workflows.general,
  };
}

function resolveWorkflowFromContext(contracts, runtimeContext) {
  const workflowName = process.env.MANSONI_WORKFLOW || runtimeContext.workflow || contracts.defaultWorkflow || 'general';
  return {
    name: workflowName,
    spec: contracts.workflows[workflowName] || contracts.workflows.general,
  };
}

function computeRufloScore(checks) {
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function computeEvidenceStatus(runtimeContext, workflowSpec) {
  const required = Array.isArray(workflowSpec.verification?.evidence)
    ? workflowSpec.verification.evidence
    : [];
  const evidence = runtimeContext.evidence && typeof runtimeContext.evidence === 'object'
    ? runtimeContext.evidence
    : {};

  const passed = required.filter((kind) => Array.isArray(evidence[kind]) && evidence[kind].length > 0);
  return {
    required,
    passed,
    missing: required.filter((kind) => !passed.includes(kind)),
  };
}

function computeFinalVerdict(rufloScore, reviewVerdict, evidenceStatus) {
  if (reviewVerdict === 'FAIL') return 'FAIL';
  if (reviewVerdict === 'PASS' && rufloScore >= 75 && evidenceStatus.missing.length === 0) return 'PASS';
  return 'RISKY';
}

async function main() {
  const projectDir = getProjectDir();
  const contractsFile = path.join(projectDir, '.claude', 'contracts', 'mansoni-workflows.json');
  const swarmDir = path.join(projectDir, 'memories', 'session', 'swarm');
  const verificationFile = path.join(swarmDir, 'verification.md');
  const stateFile = path.join(swarmDir, 'state.md');
  const contextFile = path.join(swarmDir, 'context.md');
  const decisionsFile = path.join(swarmDir, 'decisions.md');
  const runtimeContextFile = path.join(swarmDir, 'runtime-context.json');

  const contracts = await readJson(contractsFile);
  const runtimeContext = await readJsonIfExists(runtimeContextFile, {
    workflow: contracts.defaultWorkflow || 'general',
    reviewVerdict: 'PENDING',
  });
  const workflow = resolveWorkflowFromContext(contracts, runtimeContext);

  const checks = [
    await exists(stateFile),
    await exists(contextFile),
    await exists(decisionsFile),
    contracts.canonicalEntrypoint === 'mansoni',
    contracts.runtime === 'ruflo',
    contracts.namespace === 'mansoni-swarm',
  ];

  const rufloScore = computeRufloScore(checks);
  const reviewVerdict = process.env.MANSONI_REVIEW_VERDICT || runtimeContext.reviewVerdict || 'PENDING';
  const evidenceStatus = computeEvidenceStatus(runtimeContext, workflow.spec);
  const finalVerdict = computeFinalVerdict(rufloScore, reviewVerdict, evidenceStatus);
  const evidenceSummary = evidenceStatus.passed.length
    ? evidenceStatus.passed.map((kind) => {
        const entries = Array.isArray(runtimeContext.evidence?.[kind]) ? runtimeContext.evidence[kind] : [];
        const last = entries[entries.length - 1];
        return `${kind}: ${last?.summary || 'ok'}`;
      }).join('; ')
    : 'нет подтверждений';

  const markdown = [
    '# Verification Gate',
    '',
    `- Timestamp: ${now()}`,
    `- Workflow: ${workflow.name}`,
    `- Workflow label: ${workflow.spec.label}`,
    `- Canonical entrypoint: ${contracts.canonicalEntrypoint}`,
    `- Runtime layer: ${contracts.runtime}`,
    `- Namespace: ${contracts.namespace}`,
    `- Topology: ${workflow.spec.topology}`,
    `- Runtime context source: ${runtimeContext.source || 'unknown'}`,
    '',
    '## Ruflo Verification Stage',
    '',
    `- Structural score: ${rufloScore}/100`,
    `- Checks: ${workflow.spec.verification.ruflo.join(', ')}`,
    `- Result: ${rufloScore >= 75 ? 'READY' : 'WEAK'}`,
    '',
    '## Mansoni Review Gate',
    '',
    `- Required gates: ${workflow.spec.verification.mansoni.join(', ')}`,
    `- Semantic verdict: ${reviewVerdict}`,
    '',
    '## Evidence Gate',
    '',
    `- Required evidence: ${evidenceStatus.required.join(', ') || 'none'}`,
    `- Confirmed evidence: ${evidenceStatus.passed.join(', ') || 'none'}`,
    `- Missing evidence: ${evidenceStatus.missing.join(', ') || 'none'}`,
    `- Latest evidence: ${evidenceSummary}`,
    '',
    '## Final Fusion Verdict',
    '',
    `- Verdict: ${finalVerdict}`,
    '',
    '## Notes',
    '',
    '- PASS требует review verdict = PASS, достаточно сильный runtime state и подтверждённые evidence-записи.',
    '- RISKY означает, что runtime lifecycle собран, но semantic review ещё не зафиксирован либо недостаточно доказательств.',
    '- FAIL означает явный отрицательный вердикт Mansoni review layer.',
    '',
  ].join('\n');

  await fs.mkdir(swarmDir, { recursive: true });
  await fs.writeFile(verificationFile, markdown, 'utf8');
  process.stdout.write(finalVerdict);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});