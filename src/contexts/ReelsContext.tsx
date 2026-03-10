/**
 * @file src/contexts/ReelsContext.tsx
 * @description Глобальный контекст состояния модуля Reels.
 *
 * Управляет кросс-компонентными настройками:
 *  - глобальный mute/unmute (по аналогии с Instagram: один unmute — все громко)
 *  - флаг autoplay
 *  - флаг isReelsPage (для скрытия BottomNav)
 *
 * Провайдер устанавливается на верхнем уровне дерева (в App или Layout).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Интерфейс контекста
// ---------------------------------------------------------------------------

/**
 * Глобальная конфигурация и управление состоянием модуля Reels.
 * Все методы стабильны (мемоизированы через `useCallback`).
 */
export interface ReelsGlobalConfig {
  /**
   * Глобальное состояние mute.
   * `true` — звук выключен (по умолчанию при первом открытии).
   * Сбрасывается в `false` при первом действии пользователя — сохраняется до конца сессии.
   */
  isMuted: boolean;
  /** Переключить глобальный mute */
  toggleMute: () => void;

  /**
   * При `true` следующий Reel начинает воспроизводиться автоматически
   * при попадании в viewport (поведение по умолчанию).
   */
  autoplay: boolean;
  /** Установить значение autoplay */
  setAutoplay: (v: boolean) => void;

  /**
   * `true` когда пользователь находится на странице `/reels`.
   * Используется для скрытия BottomNav и других layout-адаптаций.
   */
  isReelsPage: boolean;
  /** Установить флаг isReelsPage */
  setIsReelsPage: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Создание контекста
// ---------------------------------------------------------------------------

/**
 * Контекст Reels. Для доступа к значениям используй хук `useReelsContext()`.
 * Прямое использование `ReelsContext` вне хука — намеренно не экспортируется.
 */
const ReelsContext = createContext<ReelsGlobalConfig | null>(null);
ReelsContext.displayName = 'ReelsContext';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ReelsProviderProps {
  children: React.ReactNode;
}

/**
 * Провайдер глобального состояния модуля Reels.
 *
 * Устанавливается **один раз** на верхнем уровне дерева (App / RootLayout).
 * Не хранит серверное состояние — только UI-флаги текущей сессии.
 *
 * @example
 * ```tsx
 * <ReelsProvider>
 *   <App />
 * </ReelsProvider>
 * ```
 */
export function ReelsProvider({ children }: ReelsProviderProps): JSX.Element {
  // Начальное состояние: muted=true (безопасный дефолт для автоплея в фиде)
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [autoplay, setAutoplayState] = useState<boolean>(true);
  const [isReelsPage, setIsReelsPageState] = useState<boolean>(false);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const setAutoplay = useCallback((v: boolean) => {
    setAutoplayState(v);
  }, []);

  const setIsReelsPage = useCallback((v: boolean) => {
    setIsReelsPageState(v);
  }, []);

  /**
   * Мемоизация объекта value обязательна:
   * без неё каждый ре-рендер провайдера вызовет ре-рендер всех потребителей,
   * что критично при 60fps воспроизведении видео.
   */
  const value = useMemo<ReelsGlobalConfig>(
    () => ({
      isMuted,
      toggleMute,
      autoplay,
      setAutoplay,
      isReelsPage,
      setIsReelsPage,
    }),
    [isMuted, toggleMute, autoplay, setAutoplay, isReelsPage, setIsReelsPage],
  );

  return (
    <ReelsContext.Provider value={value}>{children}</ReelsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Хук доступа
// ---------------------------------------------------------------------------

/**
 * Хук для доступа к глобальному контексту Reels.
 *
 * Выбрасывает ошибку если компонент находится вне `<ReelsProvider>`,
 * что позволяет обнаружить пропущенный провайдер на этапе разработки.
 *
 * @throws {Error} если вызван вне `ReelsProvider`
 *
 * @example
 * ```tsx
 * const { isMuted, toggleMute } = useReelsContext();
 * ```
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useReelsContext(): ReelsGlobalConfig {
  const ctx = useContext(ReelsContext);
  if (ctx === null) {
    throw new Error(
      '[ReelsContext] useReelsContext() must be used inside <ReelsProvider>. ' +
        'Ensure <ReelsProvider> is placed at the root of your component tree.',
    );
  }
  return ctx;
}
