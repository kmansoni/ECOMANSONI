/**
 * Detects inline bot trigger in input text.
 * Returns { botUsername, query } or null.
 * Pattern: @botname query text
 */
export function detectInlineBotTrigger(text: string): { botUsername: string; query: string } | null {
  const match = text.match(/^@([a-zA-Z0-9_]{3,})\s+(.+)/);
  if (!match) return null;
  return { botUsername: match[1], query: match[2].trim() };
}
