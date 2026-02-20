export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: any;
  ready: () => void;
  expand?: () => void;
  isExpanded?: boolean;
  platform?: string;
  version?: string;
  colorScheme?: "light" | "dark";
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as any)?.Telegram?.WebApp as TelegramWebApp | undefined;
  if (!tg || typeof tg.ready !== "function") return null;
  return tg;
}

export function isTelegramMiniApp(): boolean {
  return !!getTelegramWebApp();
}

export function initTelegramMiniApp(): void {
  const tg = getTelegramWebApp();
  if (!tg) return;

  try {
    tg.ready();
  } catch {
    // ignore
  }

  try {
    tg.expand?.();
  } catch {
    // ignore
  }
}
