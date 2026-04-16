import { create } from "zustand";

export interface CounterState {
  /* ── Counts ─────────────────────────────────────────────── */
  notificationsUnread: number;
  chatsUnread: number;

  /* ── Sync metadata ──────────────────────────────────────── */
  lastSyncAt: { notifications: number; chats: number };

  /**
   * Monotonic version per counter — incrementоптимист +1, setAbsolute +1.
   * Если setAbsolute пришёл с версией ≤ текущей, значит optimistic update
   * случился позже fetch — абсолютное значение устарело, игнорируем.
   */
  syncVersion: { notifications: number; chats: number };

  /* ── Absolute setters (from DB fetches / resync) ────────── */
  setNotificationsUnread: (count: number, fetchStartedAt: number) => void;
  setChatsUnread: (count: number, fetchStartedAt: number) => void;

  /* ── Optimistic deltas (from realtime events) ───────────── */
  incrementNotifications: (by?: number) => void;
  decrementNotifications: (by?: number) => void;
  incrementChats: (by?: number) => void;
  decrementChats: (by?: number) => void;

  /* ── Bulk clear ─────────────────────────────────────────── */
  clearNotifications: () => void;
  clearChats: () => void;

  /* ── Sync timestamp ─────────────────────────────────────── */
  touchSync: (key: "notifications" | "chats") => void;

  /* ── Reset on logout ────────────────────────────────────── */
  reset: () => void;
}

const INITIAL: Pick<CounterState, "notificationsUnread" | "chatsUnread" | "lastSyncAt" | "syncVersion"> = {
  notificationsUnread: 0,
  chatsUnread: 0,
  lastSyncAt: { notifications: 0, chats: 0 },
  syncVersion: { notifications: 0, chats: 0 },
};

export const useUnifiedCounterStore = create<CounterState>((set) => ({
  ...INITIAL,

  // Абсолютные setters принимают fetchStartedAt — timestamp начала fetch.
  // Если между fetchStart и сейчас был optimistic increment, syncVersion
  // уже вырос → fetch устарел → пропускаем.
  setNotificationsUnread: (count, fetchStartedAt) =>
    set((s) => {
      if (fetchStartedAt < s.lastSyncAt.notifications) return s;
      return {
        notificationsUnread: count,
        lastSyncAt: { ...s.lastSyncAt, notifications: Date.now() },
        syncVersion: { ...s.syncVersion, notifications: s.syncVersion.notifications + 1 },
      };
    }),

  setChatsUnread: (count, fetchStartedAt) =>
    set((s) => {
      if (fetchStartedAt < s.lastSyncAt.chats) return s;
      return {
        chatsUnread: count,
        lastSyncAt: { ...s.lastSyncAt, chats: Date.now() },
        syncVersion: { ...s.syncVersion, chats: s.syncVersion.chats + 1 },
      };
    }),

  incrementNotifications: (by = 1) =>
    set((s) => ({
      notificationsUnread: s.notificationsUnread + by,
      syncVersion: { ...s.syncVersion, notifications: s.syncVersion.notifications + 1 },
    })),

  decrementNotifications: (by = 1) =>
    set((s) => ({
      notificationsUnread: Math.max(0, s.notificationsUnread - by),
      syncVersion: { ...s.syncVersion, notifications: s.syncVersion.notifications + 1 },
    })),

  incrementChats: (by = 1) =>
    set((s) => ({
      chatsUnread: s.chatsUnread + by,
      syncVersion: { ...s.syncVersion, chats: s.syncVersion.chats + 1 },
    })),

  decrementChats: (by = 1) =>
    set((s) => ({
      chatsUnread: Math.max(0, s.chatsUnread - by),
      syncVersion: { ...s.syncVersion, chats: s.syncVersion.chats + 1 },
    })),

  clearNotifications: () => set({ notificationsUnread: 0 }),
  clearChats: () => set({ chatsUnread: 0 }),

  touchSync: (key) =>
    set((s) => ({ lastSyncAt: { ...s.lastSyncAt, [key]: Date.now() } })),

  reset: () => set(INITIAL),
}));
