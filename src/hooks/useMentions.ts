/**
 * useMentions — utilities for @mention parsing, suggestion, and rendering.
 *
 * Security contract:
 * - parseMentions uses a safe regex — no eval, no innerHTML.
 * - Suggestions are filtered purely client-side from an already-fetched
 *   participant list; no extra Supabase calls in the hot path.
 * - formatMentionText returns React nodes via split+map — no dangerouslySetInnerHTML.
 */
import { useMemo } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";

export interface MentionData {
  raw: string;      // the full @username string as written
  username: string; // the username without @
  startIndex: number;
  endIndex: number;
}

export interface MentionUser {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  entity_type?: "user" | "bot";
  bot_id?: string;
  supports_guest_queries?: boolean;
}

// Matches @word (letters, digits, underscores, dots, hyphens — same as most platforms).
const MENTION_REGEX = /@([\w.-]+)/g;

/**
 * Extracts all @mentions from a text string.
 * Does NOT look up users — purely lexical.
 */
export function parseMentions(text: string): MentionData[] {
  const results: MentionData[] = [];
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    results.push({
      raw: match[0],
      username: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  return results;
}

/**
 * Filters a participant list to find mention suggestions for the current query.
 * Returns at most 5 results, ranked by prefix match quality.
 */
export function getMentionSuggestions(
  query: string,
  participants: MentionUser[]
): MentionUser[] {
  const q = query.trim().toLowerCase();
  const scored = participants
    .map((participant, index) => {
      const name = (participant.display_name ?? "").toLowerCase();
      const username = (participant.username ?? "").toLowerCase();
      const botBoost = participant.entity_type === "bot" && participant.supports_guest_queries ? -1 : 0;

      if (!q) return { participant, score: botBoost + index / 1000 };
      if (username === q || name === q) return { participant, score: botBoost };
      if (username.startsWith(q)) return { participant, score: botBoost + 1 };
      if (name.startsWith(q)) return { participant, score: botBoost + 2 };
      if (username.includes(q)) return { participant, score: botBoost + 3 };
      if (name.includes(q)) return { participant, score: botBoost + 4 };
      return null;
    })
    .filter(Boolean) as Array<{ participant: MentionUser; score: number }>;

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map(({ participant }) => participant);
}

/**
 * Splits text into plain-text and mention segments for rendering.
 * Mention segments are rendered as styled, clickable spans.
 * currentUserId is used to highlight "you were mentioned" in a different shade.
 */
export function formatMentionText(
  text: string,
  participants: MentionUser[],
  currentUserId?: string,
  onMentionClick?: (user: MentionUser) => void
): React.ReactNode[] {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return [text];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const mention of mentions) {
    // Plain text before this mention
    if (mention.startIndex > cursor) {
      nodes.push(text.slice(cursor, mention.startIndex));
    }

    // Find the corresponding user
    const user = participants.find(
      (p) =>
        (p.username?.toLowerCase() === mention.username.toLowerCase()) ||
        (p.display_name?.toLowerCase() === mention.username.toLowerCase())
    );

    const isSelf = user?.user_id === currentUserId;

    nodes.push(
      React.createElement(
        "span",
        {
          key: `mention-${mention.startIndex}`,
          className: `inline cursor-pointer font-medium ${
            isSelf ? "text-cyan-300" : "text-[#6ab3f3]"
          } hover:underline`,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            if (user && onMentionClick) onMentionClick(user);
          },
        },
        mention.raw
      )
    );

    cursor = mention.endIndex;
  }

  // Remaining text
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

/**
 * Detects if the caret in an input is inside a @mention trigger.
 * Returns the partial query (without @) or null.
 *
 * Example: "Hello @joh" with caret at end → "joh"
 */
export function detectMentionTrigger(
  text: string,
  caretPos: number
): { query: string; triggerStart: number } | null {
  const slice = text.slice(0, caretPos);
  // Walk backwards to find the last '@'
  const atIdx = slice.lastIndexOf("@");
  if (atIdx === -1) return null;
  // There must be no whitespace between '@' and the caret
  const fragment = slice.slice(atIdx + 1);
  if (/\s/.test(fragment)) return null;
  return { query: fragment, triggerStart: atIdx };
}

/**
 * Inserts a mention into the input text, replacing the partial @query.
 */
export function insertMention(
  text: string,
  caretPos: number,
  triggerStart: number,
  username: string
): { newText: string; newCaretPos: number } {
  const before = text.slice(0, triggerStart);
  const after = text.slice(caretPos);
  const inserted = `@${username} `;
  return {
    newText: before + inserted + after,
    newCaretPos: before.length + inserted.length,
  };
}

/**
 * React hook wrapping mention utilities — stable references via useMemo.
 */
export function useMentions(participants: MentionUser[]) {
  const navigate = useNavigate();

  const handleMentionClick = useMemo(
    () => (user: MentionUser) => {
      navigate(`/contact/${user.user_id}`);
    },
    [navigate]
  );

  const renderText = useMemo(
    () => (text: string, currentUserId?: string) =>
      formatMentionText(text, participants, currentUserId, handleMentionClick),
    [participants, handleMentionClick]
  );

  return { parseMentions, getMentionSuggestions, renderText, insertMention, detectMentionTrigger };
}
