import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_ORDER = [
  'profile', 'quickActions', 'chats', 'music', 'taxi', 'weather',
  'todo', 'search', 'recommendations', 'notes', 'settings', 'support',
];

interface SidebarWidgetsState {
  order: string[];
  visible: string[];
  setOrder: (order: string[]) => void;
  setVisible: (visible: string[]) => void;
  reset: () => void;
}

export const useSidebarWidgets = create<SidebarWidgetsState>()(
  persist(
    (set) => ({
      order: [...DEFAULT_ORDER],
      visible: [...DEFAULT_ORDER],
      setOrder: (order) => set({ order }),
      setVisible: (visible) => set({ visible }),
      reset: () => set({ order: [...DEFAULT_ORDER], visible: [...DEFAULT_ORDER] }),
    }),
    { name: 'mansoni-sidebar-widgets' },
  ),
);
