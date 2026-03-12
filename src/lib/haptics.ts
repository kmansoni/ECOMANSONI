/**
 * @file src/lib/haptics.ts
 * @description Haptic feedback утилита — обёртка над Vibration API (Web) и
 * Capacitor Haptics (native iOS/Android).
 *
 * Архитектура:
 * - Определяем среду: Capacitor native → используем @capacitor/haptics
 * - Fallback: Web Vibration API (Android Chrome, некоторые браузеры)
 * - iOS Safari: Vibration API не поддерживается → silent fail
 * - Все функции async, никогда не бросают исключений (silent fail)
 *
 * Паттерны (соответствуют Instagram):
 * - light: лёгкий тап (лайк, выбор)
 * - medium: средний (отправка, подтверждение)
 * - heavy: сильный (удаление, ошибка)
 * - success: двойной лёгкий (успешное действие)
 * - error: тройной (ошибка)
 * - selection: минимальный (скролл по пикеру)
 * - impact: одиночный средний (double-tap лайк)
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "selection" | "impact";

// Паттерны вибрации в мс [вибрация, пауза, вибрация, ...]
const VIBRATION_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  error: [30, 50, 30, 50, 30],
  selection: 5,
  impact: 25,
};

// Определяем Capacitor
const isCapacitor = (): boolean => {
  return typeof (window as any).Capacitor !== "undefined" &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
};

// Capacitor Haptics (lazy import)
let capacitorHaptics: any = null;
const getCapacitorHaptics = async () => {
  if (capacitorHaptics) return capacitorHaptics;
  try {
    const mod = await import("@capacitor/haptics");
    capacitorHaptics = mod;
    return capacitorHaptics;
  } catch {
    return null;
  }
};

/**
 * Основная функция haptic feedback.
 * Никогда не бросает исключений.
 */
export async function haptic(pattern: HapticPattern = "light"): Promise<void> {
  try {
    if (isCapacitor()) {
      const hap = await getCapacitorHaptics();
      if (!hap) return;

      const { Haptics, ImpactStyle, NotificationType } = hap;

      switch (pattern) {
        case "light":
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case "medium":
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case "heavy":
          await Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case "success":
          await Haptics.notification({ type: NotificationType.Success });
          break;
        case "error":
          await Haptics.notification({ type: NotificationType.Error });
          break;
        case "selection":
          await Haptics.selectionStart();
          await Haptics.selectionChanged();
          await Haptics.selectionEnd();
          break;
        case "impact":
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
      }
      return;
    }

    // Web Vibration API fallback
    if ("vibrate" in navigator) {
      const vibPattern = VIBRATION_PATTERNS[pattern];
      navigator.vibrate(vibPattern);
    }
  } catch {
    // Silent fail — haptics не критичны
  }
}

/**
 * Специализированные хелперы для частых сценариев
 */
export const Haptics = {
  /** Лайк / реакция */
  like: () => haptic("impact"),
  /** Отправка сообщения */
  send: () => haptic("medium"),
  /** Успешное действие */
  success: () => haptic("success"),
  /** Ошибка */
  error: () => haptic("error"),
  /** Выбор в пикере */
  select: () => haptic("selection"),
  /** Лёгкий тап */
  tap: () => haptic("light"),
  /** Удаление */
  delete: () => haptic("heavy"),
  /** Double-tap лайк */
  doubleTap: () => haptic("impact"),
  /** Свайп между Stories */
  swipe: () => haptic("light"),
  /** Открытие bottom sheet */
  sheet: () => haptic("light"),
  /** Копирование */
  copy: () => haptic("medium"),
};
