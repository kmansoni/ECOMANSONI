const EMOJI_CORE_REGEX = /\p{Extended_Pictographic}/u;
const LETTER_OR_NUMBER_REGEX = /[\p{L}\p{N}]/u;

const graphemeSegmenter: any =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(input: string): string[] {
  if (!input) return [];

  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(input), (segment) => segment.segment).filter(Boolean);
  }

  return Array.from(input);
}

function isEmojiLikeGrapheme(grapheme: string): boolean {
  if (!EMOJI_CORE_REGEX.test(grapheme)) return false;
  if (LETTER_OR_NUMBER_REGEX.test(grapheme)) return false;
  return true;
}

// Chat UX rule: render fullscreen animation only for short emoji-only messages.
export function isSingleEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length < 1 || graphemes.length > 3) return false;

  return graphemes.every(isEmojiLikeGrapheme);
}
