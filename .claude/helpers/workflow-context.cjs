const fs = require('fs/promises');
const path = require('path');

const command = process.argv[2] || 'show';
const value = process.argv[3] || '';

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : process.cwd();
}

function now() {
  return new Date().toISOString();
}

function normalizeReviewVerdict(input) {
  const verdict = String(input || '').trim().toUpperCase();

  switch (verdict) {
    case 'PASS':
    case 'ACCEPT':
      return 'PASS';
    case 'WARN':
    case 'WARNING':
    case 'RISKY':
    case 'PARTIAL':
      return 'RISKY';
    case 'FAIL':
    case 'REJECT':
    case 'UNSAFE':
      return 'FAIL';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'IN-PROGRESS':
    case 'RUNNING':
    case 'STARTED':
      return 'PENDING';
    case '':
      return 'PENDING';
    default:
      return verdict;
  }
}

function normalizeReviewStage(input) {
  const stage = String(input || '').trim().toLowerCase();

  switch (stage) {
    case 'review-start':
    case 'review_start':
    case 'start-review':
    case 'start':
      return 'review-start';
    case 'review-pass':
    case 'pass':
      return 'review-pass';
    case 'review-risky':
    case 'risky':
    case 'warn':
    case 'warning':
      return 'review-risky';
    case 'review-fail':
    case 'fail':
      return 'review-fail';
    default:
      return stage || 'review-start';
  }
}

function stripWrappingQuotes(input) {
  const text = String(input || '').trim();

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }

  return text;
}

function normalizeEvidenceKind(input) {
  const kind = normalizeText(input);

  switch (kind) {
    case 'typescript':
    case 'typecheck':
    case 'tsc':
      return 'tsc';
    case 'eslint':
    case 'lint':
      return 'lint';
    case 'test':
    case 'tests':
    case 'vitest':
    case 'playwright':
      return 'tests';
    case 'review':
    case 'audit':
    case 'code-review':
      return 'review';
    case 'manual':
    case 'verify':
    case 'verification':
    default:
      return kind || 'manual';
  }
}

function normalizeText(input) {
  return stripWrappingQuotes(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getClassifierConfig(contracts) {
  return {
    workflowPriority: Array.isArray(contracts.classifier?.workflowPriority)
      ? contracts.classifier.workflowPriority
      : ['review', 'audit', 'security', 'bug', 'refactor', 'hardening', 'feature', 'general'],
    startKeywords: Array.isArray(contracts.classifier?.startKeywords)
      ? contracts.classifier.startKeywords
      : ['start', 'bootstrap', 'begin', 'начать', 'старт'],
    verdictKeywords: contracts.classifier?.verdictKeywords || {
      PASS: ['pass', 'accept', 'approved'],
      RISKY: ['risky', 'warn', 'warning', 'partial'],
      FAIL: ['fail', 'reject', 'unsafe'],
    },
  };
}

function keywordWeight(keyword, workflow) {
  const normalizedKeyword = normalizeText(keyword);
  const words = normalizedKeyword.split(' ').filter(Boolean);
  let score = words.length > 1 ? 4 : 2;

  if (normalizedKeyword === workflow) score += 5;
  if (normalizedKeyword.includes(workflow)) score += 2;

  return score;
}

function workflowPriorityIndex(workflow, classifier) {
  const idx = classifier.workflowPriority.indexOf(workflow);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function detectVerdict(text, contracts) {
  const normalized = normalizeText(text);
  const classifier = getClassifierConfig(contracts);
  const matched = {
    PASS: [],
    RISKY: [],
    FAIL: [],
  };

  for (const verdict of ['PASS', 'RISKY', 'FAIL']) {
    for (const keyword of classifier.verdictKeywords[verdict] || []) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      if (normalized.includes(normalizedKeyword)) {
        matched[verdict].push(keyword);
      }
    }
  }

  if (matched.FAIL.length) {
    return { verdict: 'FAIL', matches: unique(matched.FAIL) };
  }

  if (matched.RISKY.length) {
    return { verdict: 'RISKY', matches: unique(matched.RISKY) };
  }

  if (matched.PASS.length) {
    return { verdict: 'PASS', matches: unique(matched.PASS) };
  }

  return { verdict: 'PENDING', matches: [] };
}

function shouldStartReview(text, workflow, contracts) {
  if (!['review', 'audit'].includes(workflow)) return false;

  const normalized = normalizeText(text);
  const classifier = getClassifierConfig(contracts);
  return (classifier.startKeywords || []).some((keyword) => normalized.includes(normalizeText(keyword)));
}

function pickWorkflowCandidate(candidates, currentWorkflow, verdict, classifier) {
  if (!candidates.length) {
    return null;
  }

  const top = candidates[0];
  const second = candidates[1];

  if (
    verdict !== 'PENDING' &&
    ['review', 'audit'].includes(currentWorkflow) &&
    top.score > 0 &&
    Math.abs(top.score - (second?.score || 0)) <= 2 &&
    ['review', 'audit'].includes(top.workflow)
  ) {
    const current = candidates.find((item) => item.workflow === currentWorkflow);
    if (current && current.score > 0) {
      return current;
    }
  }

  return top;
}

function inferWorkflowFromText(description, contracts) {
  const normalized = normalizeText(description);
  const classifier = getClassifierConfig(contracts);

  if (!normalized) {
    return {
      workflow: contracts.defaultWorkflow || 'general',
      confidence: 'low',
      matches: [],
      score: 0,
      candidates: [],
    };
  }

  const scored = Object.entries(contracts.workflows || {}).map(([workflow, spec]) => {
    const keywords = Array.isArray(spec.keywords) ? spec.keywords : [];
    const matches = [];
    let score = 0;

    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      if (!normalized.includes(normalizedKeyword)) continue;

      matches.push(keyword);
      score += keywordWeight(keyword, workflow);
    }

    if (normalized.includes(`workflow ${workflow}`) || normalized.includes(`${workflow} workflow`)) {
      score += 7;
      matches.push(`workflow:${workflow}`);
    }

    return {
      workflow,
      score,
      matches: unique(matches),
      priority: workflowPriorityIndex(workflow, classifier),
    };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.priority - right.priority;
  });

  const winner = scored[0];
  if (!winner || winner.score === 0) {
    return {
      workflow: contracts.defaultWorkflow || 'general',
      confidence: 'low',
      matches: [],
      score: 0,
      candidates: scored,
    };
  }

  return {
    workflow: winner.workflow,
    confidence: winner.score >= 8 ? 'high' : winner.score >= 4 ? 'medium' : 'low',
    matches: winner.matches,
    score: winner.score,
    candidates: scored,
  };
}

function verdictToStage(verdict) {
  switch (verdict) {
    case 'PASS':
      return 'review-pass';
    case 'RISKY':
      return 'review-risky';
    case 'FAIL':
      return 'review-fail';
    default:
      return 'review-start';
  }
}

function mergeStageHistory(history, entry) {
  const list = Array.isArray(history) ? history : [];
  const last = list[list.length - 1];

  if (
    last &&
    last.type === entry.type &&
    last.stage === entry.stage &&
    last.verdict === entry.verdict &&
    last.source === entry.source
  ) {
    return list;
  }

  return [...list, entry];
}

async function applyTaskIntent({ projectDir, contextFile, context, contracts, phase, description }) {
  const workflowInference = inferWorkflowFromText(description, contracts);
  const verdictInference = detectVerdict(description, contracts);
  const classifier = getClassifierConfig(contracts);
  const winner = pickWorkflowCandidate(
    workflowInference.candidates || [],
    context.workflow,
    verdictInference.verdict,
    classifier,
  );

  const workflow = winner?.workflow || workflowInference.workflow || context.workflow || contracts.defaultWorkflow || 'general';
  const next = {
    ...context,
    workflow,
    taskDescription: description,
    inference: {
      confidence: workflowInference.confidence,
      matches: winner?.matches || workflowInference.matches || [],
      score: winner?.score || workflowInference.score || 0,
      conflicts: (workflowInference.candidates || [])
        .filter((candidate) => candidate.score > 0 && candidate.workflow !== workflow)
        .slice(0, 3)
        .map((candidate) => ({
          workflow: candidate.workflow,
          score: candidate.score,
          matches: candidate.matches,
        })),
    },
    updatedAt: now(),
    source: `task-intent-${phase}`,
  };

  if (phase === 'pre') {
    next.reviewStages = Array.isArray(context.reviewStages) ? context.reviewStages : [];

    if (verdictInference.verdict !== 'PENDING') {
      next.reviewVerdict = verdictInference.verdict;
      next.reviewStages = mergeStageHistory(next.reviewStages, {
        at: now(),
        type: 'review-stage',
        stage: verdictToStage(verdictInference.verdict),
        verdict: verdictInference.verdict,
        source: 'task-intent',
      });
    } else if (shouldStartReview(description, workflow, contracts)) {
      next.reviewVerdict = 'PENDING';
      next.reviewStages = mergeStageHistory(next.reviewStages, {
        at: now(),
        type: 'review-stage',
        stage: 'review-start',
        verdict: 'PENDING',
        source: 'task-intent',
      });
    }
  }

  if (phase === 'post' && verdictInference.verdict !== 'PENDING') {
    next.reviewVerdict = verdictInference.verdict;
    next.reviewStages = mergeStageHistory(Array.isArray(context.reviewStages) ? context.reviewStages : [], {
      at: now(),
      type: 'review-stage',
      stage: verdictToStage(verdictInference.verdict),
      verdict: verdictInference.verdict,
      source: 'task-intent',
    });
  }

  if (!next.reviewVerdict) {
    next.reviewVerdict = context.reviewVerdict || 'PENDING';
  }

  await writeContext(contextFile, next);
  await appendDecision(
    projectDir,
    `task intent ${phase}: workflow=${workflow} score=${next.inference.score} confidence=${next.inference.confidence} verdict=${next.reviewVerdict}`,
  );

  return {
    workflow,
    reviewVerdict: next.reviewVerdict,
    inference: next.inference,
  };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readContracts(projectDir) {
  const filePath = path.join(projectDir, '.claude', 'contracts', 'mansoni-workflows.json');
  return readJson(filePath, {
    defaultWorkflow: 'general',
    workflows: { general: {} },
  });
}

async function readContext(contextFile, defaultWorkflow) {
  return readJson(contextFile, {
    workflow: defaultWorkflow,
    reviewVerdict: 'PENDING',
    reviewStages: [],
    evidence: {},
    updatedAt: now(),
    source: 'bootstrap',
  });
}

function nextEvidence(context, kind, summary) {
  const evidence = context.evidence && typeof context.evidence === 'object' ? context.evidence : {};
  const existing = Array.isArray(evidence[kind]) ? evidence[kind] : [];
  const entry = {
    at: now(),
    summary,
  };

  return {
    ...evidence,
    [kind]: [...existing, entry].slice(-10),
  };
}

function nextVerdictFromStage(stage, currentVerdict) {
  switch (stage) {
    case 'review-pass':
      return 'PASS';
    case 'review-risky':
      return currentVerdict === 'FAIL' ? 'FAIL' : 'RISKY';
    case 'review-fail':
      return 'FAIL';
    case 'review-start':
    default:
      return currentVerdict || 'PENDING';
  }
}

async function writeContext(contextFile, context) {
  await fs.writeFile(contextFile, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
}

async function appendDecision(projectDir, text) {
  const decisionsFile = path.join(projectDir, 'memories', 'session', 'swarm', 'decisions.md');
  await ensureDir(path.dirname(decisionsFile));
  try {
    await fs.access(decisionsFile);
  } catch {
    await fs.writeFile(decisionsFile, '# Decisions\n\n', 'utf8');
  }

  await fs.appendFile(decisionsFile, `- ${now()} | ${text}\n`, 'utf8');
}

async function main() {
  const projectDir = getProjectDir();
  const swarmDir = path.join(projectDir, 'memories', 'session', 'swarm');
  const contextFile = path.join(swarmDir, 'runtime-context.json');

  await ensureDir(swarmDir);

  const contracts = await readContracts(projectDir);
  const defaultWorkflow = contracts.defaultWorkflow || 'general';
  const context = await readContext(contextFile, defaultWorkflow);

  if (command === 'workflow') {
    const workflow = stripWrappingQuotes(value) || defaultWorkflow;

    if (!contracts.workflows[workflow]) {
      throw new Error(`unknown workflow: ${workflow}`);
    }

    const next = {
      ...context,
      workflow,
      reviewVerdict: 'PENDING',
      reviewStages: [],
      evidence: {},
      updatedAt: now(),
      source: 'workflow-command',
    };

    await writeContext(contextFile, next);
    await appendDecision(projectDir, `workflow context set: ${workflow}`);
    process.stdout.write(workflow);
    return;
  }

  if (command === 'infer') {
    const description = stripWrappingQuotes(process.argv.slice(3).join(' '));
    const result = await applyTaskIntent({
      projectDir,
      contextFile,
      context,
      contracts,
      phase: 'pre',
      description,
    });
    process.stdout.write(result.workflow);
    return;
  }

  if (command === 'task-intent') {
    const phase = stripWrappingQuotes(process.argv[3] || 'pre');
    const description = stripWrappingQuotes(process.argv.slice(4).join(' '));
    const result = await applyTaskIntent({
      projectDir,
      contextFile,
      context,
      contracts,
      phase,
      description,
    });
    process.stdout.write(`${JSON.stringify(result)}`);
    return;
  }

  if (command === 'review-verdict') {
    const normalized = normalizeReviewVerdict(stripWrappingQuotes(value));
    const next = {
      ...context,
      reviewVerdict: normalized,
      reviewStages: [
        ...(Array.isArray(context.reviewStages) ? context.reviewStages : []),
        {
          at: now(),
          type: 'review-verdict',
          verdict: normalized,
        },
      ],
      updatedAt: now(),
      source: 'review-verdict-command',
    };

    await writeContext(contextFile, next);
    await appendDecision(projectDir, `review verdict set: ${normalized}`);
    process.stdout.write(normalized);
    return;
  }

  if (command === 'evidence') {
    const kind = normalizeEvidenceKind(process.argv[3] || 'manual');
    const summary = stripWrappingQuotes(process.argv.slice(4).join(' ')) || `${kind} evidence captured`;
    const next = {
      ...context,
      evidence: nextEvidence(context, kind, summary),
      updatedAt: now(),
      source: 'evidence-command',
    };

    await writeContext(contextFile, next);
    await appendDecision(projectDir, `evidence recorded: ${kind} | ${summary}`);
    process.stdout.write(kind);
    return;
  }

  if (command === 'review-stage') {
    const stage = normalizeReviewStage(stripWrappingQuotes(value));
    const nextVerdict = nextVerdictFromStage(stage, context.reviewVerdict);
    const next = {
      ...context,
      reviewVerdict: nextVerdict,
      reviewStages: [
        ...(Array.isArray(context.reviewStages) ? context.reviewStages : []),
        {
          at: now(),
          type: 'review-stage',
          stage,
          verdict: nextVerdict,
        },
      ],
      updatedAt: now(),
      source: 'review-stage-command',
    };

    await writeContext(contextFile, next);
    await appendDecision(projectDir, `review stage set: ${stage} -> ${nextVerdict}`);
    process.stdout.write(`${stage}:${nextVerdict}`);
    return;
  }

  if (command === 'reset') {
    const next = {
      workflow: defaultWorkflow,
      reviewVerdict: 'PENDING',
      reviewStages: [],
      evidence: {},
      updatedAt: now(),
      source: 'reset',
    };

    await writeContext(contextFile, next);
    await appendDecision(projectDir, 'runtime context reset');
    process.stdout.write('reset');
    return;
  }

  await writeContext(contextFile, context);
  process.stdout.write(`${JSON.stringify(context)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});