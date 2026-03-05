type MessageBase = {
  id: string;
  created_at: string;
};

type MessageWithOptionalUpdate = MessageBase & {
  updated_at?: string | null;
  edited_at?: string | null;
};

function compareByCreatedAtAsc<T extends MessageBase>(left: T, right: T): number {
  const leftTs = Date.parse(left.created_at);
  const rightTs = Date.parse(right.created_at);

  if (!Number.isNaN(leftTs) && !Number.isNaN(rightTs) && leftTs !== rightTs) {
    return leftTs - rightTs;
  }

  return left.id.localeCompare(right.id);
}

function compareByCreatedAtAscWithId<T extends MessageBase>(
  left: T,
  right: T,
): number {
  const byCreatedAt = compareByCreatedAtAsc(left, right);
  if (byCreatedAt !== 0) return byCreatedAt;
  return left.id.localeCompare(right.id);
}

function getMessageVersionTimestamp(message: Partial<MessageWithOptionalUpdate>): number {
  const candidates = [message.updated_at, message.edited_at];
  for (const candidate of candidates) {
    const parsed = Date.parse(String(candidate ?? ""));
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

function isIncomingMessageStale<T extends MessageWithOptionalUpdate>(
  current: T,
  incoming: T,
): boolean {
  const currentVersion = getMessageVersionTimestamp(current);
  const incomingVersion = getMessageVersionTimestamp(incoming);

  if (Number.isNaN(currentVersion) || Number.isNaN(incomingVersion)) {
    return false;
  }

  return incomingVersion < currentVersion;
}

function findInsertionIndex<T extends MessageBase>(list: T[], message: T): number {
  let low = 0;
  let high = list.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const midMessage = list[mid];
    const comparison = compareByCreatedAtAscWithId(midMessage, message);
    if (comparison <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function upsertRealtimeMessage<T extends MessageBase>(
  list: T[],
  message: T,
): T[] {
  const index = list.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    const current = list[index] as T & MessageWithOptionalUpdate;
    const incoming = message as T & MessageWithOptionalUpdate;
    if (isIncomingMessageStale(current, incoming)) {
      return list;
    }

    const merged = { ...list[index], ...message } as T;
    const createdAtChanged = list[index].created_at !== merged.created_at;

    if (!createdAtChanged) {
      const next = [...list];
      next[index] = merged;
      return next;
    }

    const withoutCurrent = [...list.slice(0, index), ...list.slice(index + 1)];
    const insertionIndex = findInsertionIndex(withoutCurrent, merged);
    return [
      ...withoutCurrent.slice(0, insertionIndex),
      merged,
      ...withoutCurrent.slice(insertionIndex),
    ];
  }

  const insertionIndex = findInsertionIndex(list, message);
  return [
    ...list.slice(0, insertionIndex),
    message,
    ...list.slice(insertionIndex),
  ];
}

export function removeRealtimeMessage<T extends { id: string }>(
  list: T[],
  messageId: string,
): T[] {
  if (!messageId) return list;
  const hasItem = list.some((item) => item.id === messageId);
  if (!hasItem) return list;
  return list.filter((item) => item.id !== messageId);
}
