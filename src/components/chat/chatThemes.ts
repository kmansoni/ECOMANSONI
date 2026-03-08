export const CHAT_THEMES = [
  { id: "default", label: "По умолчанию", gradient: "from-zinc-900 to-zinc-950", preview: "#18181b" },
  { id: "midnight", label: "Полночь", gradient: "from-indigo-950 to-black", preview: "#1e1b4b" },
  { id: "rose", label: "Роза", gradient: "from-rose-950 to-zinc-950", preview: "#4c0519" },
  { id: "ocean", label: "Океан", gradient: "from-cyan-950 to-zinc-950", preview: "#083344" },
  { id: "forest", label: "Лес", gradient: "from-green-950 to-zinc-950", preview: "#052e16" },
  { id: "sunset", label: "Закат", gradient: "from-orange-950 to-zinc-950", preview: "#431407" },
  { id: "purple", label: "Фиолетовый", gradient: "from-purple-950 to-zinc-950", preview: "#3b0764" },
  { id: "gold", label: "Золото", gradient: "from-yellow-950 to-zinc-950", preview: "#422006" },
  { id: "pink", label: "Розовый", gradient: "from-pink-950 to-zinc-950", preview: "#500724" },
  { id: "teal", label: "Бирюза", gradient: "from-teal-950 to-zinc-950", preview: "#042f2e" },
  { id: "red", label: "Красный", gradient: "from-red-950 to-zinc-950", preview: "#450a0a" },
  { id: "blue", label: "Синий", gradient: "from-blue-950 to-zinc-950", preview: "#172554" },
] as const;

export type ThemeId = (typeof CHAT_THEMES)[number]["id"];

export const CHAT_THEME_IDS: readonly ThemeId[] = CHAT_THEMES.map((theme) => theme.id);

export function isThemeId(value: string): value is ThemeId {
  return CHAT_THEME_IDS.includes(value as ThemeId);
}
