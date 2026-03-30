export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
  ready: () => void;
  expand?: () => void;
  isExpanded?: boolean;
  platform?: string;
  version?: string;
  colorScheme?: "light" | "dark";
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  // window.Telegram?.WebApp объявлен как unknown (declare global в useVideoCall.ts)
  const raw = window.Telegram?.WebApp;
  if (raw && typeof raw === "object" && "ready" in raw && typeof (raw as TelegramWebApp).ready === "function") {
    return raw as TelegramWebApp;
  }
  return null;
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
