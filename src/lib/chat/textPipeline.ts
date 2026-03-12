import { sanitizeTextForTransport } from "@/lib/text-encoding";

function isWordFragment(input: string): boolean {
  return /^[\p{L}\p{N}]{1,12}$/u.test(input);
}

function endsSentenceLike(input: string): boolean {
  return /[.!?:;…)]$/.test(input);
}

function startsUpper(input: string): boolean {
  return /^[\p{Lu}]/u.test(input);
}

// Repairs accidental hard wraps inside words while preserving normal paragraphs.
export function repairBrokenLineWrapArtifacts(text: string): string {
  if (!text) return "";

  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length < 2) return normalized;

  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  if (
    nonEmpty.length >= 2 &&
    nonEmpty.length <= 64 &&
    nonEmpty.every((part) => /^[\p{L}\p{N}]{1,3}$/u.test(part))
  ) {
    return nonEmpty.join("");
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const currentRaw = lines[i];
    const nextRaw = i + 1 < lines.length ? lines[i + 1] : null;
    const current = currentRaw.trim();
    const next = nextRaw?.trim() ?? "";

    if (!nextRaw || current.length === 0 || next.length === 0) {
      out.push(currentRaw);
      continue;
    }

    const canStitch =
      isWordFragment(current) &&
      isWordFragment(next) &&
      !endsSentenceLike(current) &&
      !startsUpper(next) &&
      (current.length <= 4 || next.length <= 4);

    if (canStitch) {
      lines[i + 1] = `${current}${next}`;
      continue;
    }

    out.push(currentRaw);
  }

  return out.join("\n");
}

export function canonicalizeOutgoingChatText(raw: string): string {
  return sanitizeTextForTransport(repairBrokenLineWrapArtifacts(raw)).trim();
}
