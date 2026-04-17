/**
 * STM — Semantic Transformation Modules (frontend-portable).
 *
 * Портирован из services/godmode-api/src/lib/stm.ts для использования
 * в браузере, Edge Functions и AI-компонентах проекта.
 *
 * Пост-обработка ответов LLM:
 *   - hedge_reducer: убирает "я думаю", "возможно", "наверное"
 *   - direct_mode: убирает преамбулы и филлеры ("конечно", "отличный вопрос")
 *   - casual_mode: сокращает формальности ("do not" → "don't")
 *   - curiosity_bias: добавляет exploration prompt в конце
 *
 * Важно: hedge_reducer/direct_mode НЕ применяются внутри markdown code
 * fences (```…```) — чтобы не ломать фразы вроде `I think` в коде.
 */

export type STMModule = 'hedge_reducer' | 'direct_mode' | 'casual_mode' | 'curiosity_bias';

export interface TransformResult {
  original: string;
  transformed: string;
  applied: STMModule[];
  changes: number;
}

// ── Защита кода от трансформации ─────────────────────────────────────────────

interface CodeFence {
  placeholder: string;
  original: string;
}

/**
 * Выдёргивает все markdown code fences (```…``` и `…`) из текста
 * в плейсхолдеры, чтобы трансформации не трогали код.
 */
function extractCodeFences(text: string): { stripped: string; fences: CodeFence[] } {
  const fences: CodeFence[] = [];
  let idx = 0;

  // ```…``` (многострочные)
  let stripped = text.replace(/```[\s\S]*?```/g, (m) => {
    const placeholder = `\u0000MANSONI_CODE_FENCE_${idx++}\u0000`;
    fences.push({ placeholder, original: m });
    return placeholder;
  });

  // `…` (inline code)
  stripped = stripped.replace(/`[^`\n]+`/g, (m) => {
    const placeholder = `\u0000MANSONI_CODE_INLINE_${idx++}\u0000`;
    fences.push({ placeholder, original: m });
    return placeholder;
  });

  return { stripped, fences };
}

function restoreCodeFences(text: string, fences: CodeFence[]): string {
  let result = text;
  for (const f of fences) {
    result = result.replace(f.placeholder, f.original);
  }
  return result;
}

// ── Hedge Reducer ────────────────────────────────────────────────────────────

const HEDGES_RU: RegExp[] = [
  /(я думаю,?\s*что\s*)/gi,
  /(мне кажется,?\s*что?\s*)/gi,
  /(возможно,?\s*)/gi,
  /(наверное,?\s*)/gi,
  /(вероятно,?\s*)/gi,
  /(пожалуй,?\s*)/gi,
  /(скорее всего,?\s*)/gi,
  /(по моему мнению,?\s*)/gi,
  /(как мне представляется,?\s*)/gi,
];

const HEDGES_EN: RegExp[] = [
  /\b(I think\s*(that\s*)?)/gi,
  /\b(I believe\s*(that\s*)?)/gi,
  /\b(maybe\s*)/gi,
  /\b(perhaps\s*)/gi,
  /\b(probably\s*)/gi,
  /\b(it seems like\s*)/gi,
  /\b(it appears that\s*)/gi,
  /\b(in my opinion,?\s*)/gi,
  /\b(I would say\s*(that\s*)?)/gi,
];

function reduceHedges(text: string): { text: string; changes: number } {
  const { stripped, fences } = extractCodeFences(text);
  let changes = 0;
  let result = stripped;

  for (const pat of [...HEDGES_RU, ...HEDGES_EN]) {
    const before = result;
    result = result.replace(pat, '');
    if (result !== before) changes++;
  }

  // Cleanup: orphaned commas, multiple spaces
  result = result.replace(/,(\s*,)+/g, ',');
  result = result.replace(/^\s*,\s*/, '');
  result = result.replace(/\.\s*,/g, '.');
  result = result.replace(/\s{2,}/g, ' ').trim();
  result = result.replace(/^([a-zа-яё])/i, (_, c: string) => c.toUpperCase());

  return { text: restoreCodeFences(result, fences), changes };
}

// ── Direct Mode ──────────────────────────────────────────────────────────────

const PREAMBLES_RU: RegExp[] = [
  /(конечно же[!,.]?\s*)/gi,
  /(конечно[!,.]?\s*)/gi,
  /(разумеется[!,.]?\s*)/gi,
  /(безусловно[!,.]?\s*)/gi,
  /(отличный вопрос[!,.]\s*)/gi,
  /(хороший вопрос[!,.]\s*)/gi,
  /(рад помочь[!,.]\s*)/gi,
  /(с удовольствием[!,.]\s*)/gi,
  /(давайте разберёмся[!,.]\s*)/gi,
  /(давайте я попробую объяснить\.?\s*)/gi,
  /(по сути,?\s*)/gi,
];

const PREAMBLES_EN: RegExp[] = [
  /(sure[!,.]?\s*)/gi,
  /(of course[!,.]?\s*)/gi,
  /(absolutely[!,.]?\s*)/gi,
  /(great question[!,.]\s*)/gi,
  /(good question[!,.]\s*)/gi,
  /(certainly[!,.]?\s*)/gi,
  /(I'd be happy to help[!,.]\s*)/gi,
  /(let me explain[!,.]\s*)/gi,
];

const FILLERS_EN: RegExp[] = [
  /\b(furthermore,?\s*)/gi,
  /\b(additionally,?\s*)/gi,
  /\b(moreover,?\s*)/gi,
  /\b(it is worth noting that\s*)/gi,
  /\b(it's important to note that\s*)/gi,
  /\b(it should be mentioned that\s*)/gi,
  /\b(as a matter of fact,?\s*)/gi,
];

const FILLERS_RU: RegExp[] = [
  /(кроме того,?\s*)/gi,
  /(более того,?\s*)/gi,
  /(стоит отметить,?\s*что?\s*)/gi,
  /(важно отметить,?\s*что?\s*)/gi,
  /(следует упомянуть,?\s*что?\s*)/gi,
  /(необходимо подчеркнуть,?\s*что?\s*)/gi,
];

function directMode(text: string): { text: string; changes: number } {
  const { stripped, fences } = extractCodeFences(text);
  let changes = 0;
  let result = stripped;

  for (const pat of [...PREAMBLES_RU, ...PREAMBLES_EN]) {
    const before = result;
    result = result.replace(pat, '');
    if (result !== before) changes++;
  }
  for (const pat of [...FILLERS_EN, ...FILLERS_RU]) {
    const before = result;
    result = result.replace(pat, '');
    if (result !== before) changes++;
  }

  // "utilize" → "use"
  const before = result;
  result = result.replace(/\butilize\b/gi, 'use');
  if (result !== before) changes++;

  result = result.replace(/,\s*,/g, ',');
  result = result.replace(/^\s*,\s*/, '');
  result = result.replace(/\s{2,}/g, ' ').trim();
  result = result.replace(/^([a-zа-яё])/i, (_, c: string) => c.toUpperCase());

  return { text: restoreCodeFences(result, fences), changes };
}

// ── Casual Mode ──────────────────────────────────────────────────────────────

function casualMode(text: string): { text: string; changes: number } {
  const { stripped, fences } = extractCodeFences(text);
  let changes = 0;
  let result = stripped;

  const replacements: [RegExp, string][] = [
    [/\bIn conclusion,?\s*/gi, ''],
    [/\bTo summarize,?\s*/gi, ''],
    [/\bВ заключение,?\s*/gi, ''],
    [/\bПодводя итог,?\s*/gi, ''],
    [/\bdo not\b/gi, "don't"],
    [/\bcannot\b/gi, "can't"],
    [/\bwill not\b/gi, "won't"],
    [/\bshould not\b/gi, "shouldn't"],
  ];

  for (const [pat, rep] of replacements) {
    const before = result;
    result = result.replace(pat, rep);
    if (result !== before) changes++;
  }

  return { text: restoreCodeFences(result.trim(), fences), changes };
}

// ── Curiosity Bias ───────────────────────────────────────────────────────────

function curiosityBias(text: string): { text: string; changes: number } {
  const prompts = [
    '\n\n💡 Хотите узнать больше?',
    '\n\n🔍 Интересно копнуть глубже?',
    '\n\n⚡ Want to explore further?',
  ];
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  return { text: text.trimEnd() + prompt, changes: 1 };
}

// ── Публичный API ────────────────────────────────────────────────────────────

const MODULE_FNS: Record<STMModule, (text: string) => { text: string; changes: number }> = {
  hedge_reducer: reduceHedges,
  direct_mode: directMode,
  casual_mode: casualMode,
  curiosity_bias: curiosityBias,
};

export function transform(text: string, modules: STMModule[]): TransformResult {
  let current = text;
  let totalChanges = 0;
  const applied: STMModule[] = [];

  for (const mod of modules) {
    const fn = MODULE_FNS[mod];
    if (!fn) continue;
    const res = fn(current);
    if (res.changes > 0) {
      current = res.text;
      totalChanges += res.changes;
      applied.push(mod);
    }
  }

  return { original: text, transformed: current, applied, changes: totalChanges };
}

export interface ModuleInfo {
  id: STMModule;
  name: string;
  description: string;
}

export function listModules(): ModuleInfo[] {
  return [
    { id: 'hedge_reducer', name: 'Hedge Reducer', description: 'Убирает "я думаю", "возможно", "наверное" и подобные hedges' },
    { id: 'direct_mode',   name: 'Direct Mode',   description: 'Убирает преамбулы, филлеры, формальные обороты' },
    { id: 'casual_mode',   name: 'Casual Mode',   description: 'Упрощает формальный стиль, добавляет сокращения' },
    { id: 'curiosity_bias', name: 'Curiosity Bias', description: 'Добавляет exploration prompt в конце' },
  ];
}
