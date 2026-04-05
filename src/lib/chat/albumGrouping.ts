import type { ChatMessage } from "@/hooks/useChat";

export interface AlbumGroup {
  albumId: string;
  messages: ChatMessage[];
}

export function buildAlbumMap(messages: ChatMessage[]) {
  const albumMap = new Map<string, AlbumGroup>();
  const skipIds = new Set<string>();

  let i = 0;
  while (i < messages.length) {
    const meta = messages[i].metadata as Record<string, unknown> | null | undefined;
    const albumId = meta?.album_id as string | undefined;

    if (albumId) {
      const group: ChatMessage[] = [messages[i]];
      let j = i + 1;
      while (j < messages.length) {
        const nextMeta = messages[j].metadata as Record<string, unknown> | null | undefined;
        if (nextMeta?.album_id !== albumId) break;
        group.push(messages[j]);
        skipIds.add(messages[j].id);
        j++;
      }
      if (group.length > 1) {
        albumMap.set(messages[i].id, { albumId, messages: group });
      }
      i = j;
    } else {
      i++;
    }
  }

  return { albumMap, skipIds };
}
