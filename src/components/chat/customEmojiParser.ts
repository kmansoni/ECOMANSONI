/**
 * Parse custom emoji references in text.
 * Format: <emoji:id>
 * Returns segments of plain text and emoji references.
 */
export interface TextSegment {
  type: "text" | "custom-emoji";
  content: string;
  emojiId?: string;
}

const CUSTOM_EMOJI_REGEX = /<emoji:([a-zA-Z0-9_-]+)>/g;

export function parseCustomEmoji(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CUSTOM_EMOJI_REGEX.lastIndex = 0;
  while ((match = CUSTOM_EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "custom-emoji", content: match[0], emojiId: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}
