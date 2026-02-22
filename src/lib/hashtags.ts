export type HashtagStatus = "normal" | "restricted" | "hidden" | string;

// Keep this aligned with SQL: regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g')
const HASHTAG_RE = /#[а-яА-ЯёЁa-zA-Z0-9_]+/g;

/**
 * Extracts normalized hashtag tokens from free-form text.
 * - Returned tags are lowercase
 * - Returned tags do NOT include leading '#'
 * - Unique, preserves first-seen order
 */
export function extractNormalizedHashtags(text: string): string[] {
  const raw = String(text ?? "");
  const matches = raw.match(HASHTAG_RE) ?? [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const m of matches) {
    const normalized = m.slice(1).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export function formatHashtag(normalizedTag: string): string {
  const t = String(normalizedTag ?? "").trim();
  if (!t) return "#";
  return t.startsWith("#") ? t : `#${t}`;
}
