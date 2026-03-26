import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { announceToScreenReader } from '@/lib/accessibility/a11y';
import { logger } from '@/lib/logger';

export type FontSize = 'sm' | 'md' | 'lg' | 'xl';
export type ColorFilter = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface AccessibilitySettings {
  fontSize: FontSize;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderAnnounce: boolean;
  colorFilter: ColorFilter;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontSize: 'md',
  highContrast: false,
  reducedMotion: false,
  screenReaderAnnounce: true,
  colorFilter: 'none',
};

const LS_KEY = 'a11y_settings';

function loadFromStorage(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    logger.warn('[useAccessibility] Failed to read settings from storage', { error });
  }
  return { ...DEFAULT_SETTINGS };
}

function applyToDOM(settings: AccessibilitySettings) {
  const body = document.body;

  // Размер шрифта
  body.classList.remove('font-sm', 'font-md', 'font-lg', 'font-xl');
  if (settings.fontSize !== 'md') body.classList.add(`font-${settings.fontSize}`);

  // Высокий контраст
  body.classList.toggle('high-contrast', settings.highContrast);

  // Уменьшение анимаций
  body.classList.toggle('reduce-motion', settings.reducedMotion);

  // Цветовые фильтры
  body.classList.remove('filter-protanopia', 'filter-deuteranopia', 'filter-tritanopia');
  if (settings.colorFilter !== 'none') {
    body.classList.add(`filter-${settings.colorFilter}`);
  }
}

export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(loadFromStorage);

  // Применить настройки при монтировании и изменении
  useEffect(() => {
    applyToDOM(settings);
  }, [settings]);

  // Учитываем системные prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setSettings((prev) => (prev.reducedMotion ? prev : { ...prev, reducedMotion: true }));
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setSettings((prev) => (prev.reducedMotion ? prev : { ...prev, reducedMotion: true }));
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });

    // Синхронизировать с Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await (supabase as any)
          .from('user_settings')
          .upsert(
            { user_id: user.id, accessibility: { ...loadFromStorage(), ...partial } },
            { onConflict: 'user_id' }
          );
        if (error) {
          console.error('[useAccessibility] upsert failed:', error.message);
          // НЕ бросаем ошибку — localStorage fallback уже применён
        }
      }
    } catch (error) {
      logger.warn('[useAccessibility] Failed to sync settings to Supabase', { error });
    }
  }, []);

  const announce = useCallback((message: string) => {
    if (settings.screenReaderAnnounce) {
      announceToScreenReader(message);
    }
  }, [settings.screenReaderAnnounce]);

  return {
    settings,
    updateSettings,
    fontSize: settings.fontSize,
    highContrast: settings.highContrast,
    reducedMotion: settings.reducedMotion,
    screenReaderAnnounce: settings.screenReaderAnnounce,
    colorFilter: settings.colorFilter,
    announce,
  };
}
