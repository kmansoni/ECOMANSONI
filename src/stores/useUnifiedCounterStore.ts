import { create } from "zustand";

export interface CounterState {
  /* ── Counts ─────────────────────────────────────────────── */
  notificationsUnread: number;
  chatsUnread: number;

  /* ── Sync metadata ──────────────────────────────────────── */
  lastSyncAt: { notifications: number; chats: number };

  /* ── Absolute setters (from DB fetches / resync) ────────── */
  setNotificationsUnread: (count: number) => void;
  setChatsUnread: (count: number) => void;

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

const INITIAL: Pick<CounterState, "notificationsUnread" | "chatsUnread" | "lastSyncAt"> = {
  notificationsUnread: 0,
  chatsUnread: 0,
  lastSyncAt: { notifications: 0, chats: 0 },
};

export const useUnifiedCounterStore = create<CounterState>((set) => ({
  ...INITIAL,

  setNotificationsUnread: (count) =>
    set({ notificationsUnread: count, lastSyncAt: { ...useUnifiedCounterStore.getState().lastSyncAt, notifications: Date.now() } }),

  setChatsUnread: (count) =>
    set({ chatsUnread: count, lastSyncAt: { ...useUnifiedCounterStore.getState().lastSyncAt, chats: Date.now() } }),

  incrementNotifications: (by = 1) =>
    set((s) => ({ notificationsUnread: s.notificationsUnread + by })),

  decrementNotifications: (by = 1) =>
    set((s) => ({ notificationsUnread: Math.max(0, s.notificationsUnread - by) })),

  incrementChats: (by = 1) =>
    set((s) => ({ chatsUnread: s.chatsUnread + by })),

  decrementChats: (by = 1) =>
    set((s) => ({ chatsUnread: Math.max(0, s.chatsUnread - by) })),

  clearNotifications: () => set({ notificationsUnread: 0 }),
  clearChats: () => set({ chatsUnread: 0 }),

  touchSync: (key) =>
    set((s) => ({ lastSyncAt: { ...s.lastSyncAt, [key]: Date.now() } })),

  reset: () => set(INITIAL),
}));
