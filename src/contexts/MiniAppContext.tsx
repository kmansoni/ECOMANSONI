/**
 * MiniAppContext — React-провайдер для Mini App
 *
 * Обёртывает useMiniApp() и предоставляет контекст + рендерит
 * BottomBar-компоненты через портал в контейнер mini-app.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useMiniApp, UseMiniAppReturn } from '@/hooks/useMiniApp';
import { BackButton } from '@/components/BackButton';
import { SettingsButton } from '@/components/SettingsButton';

type MiniAppContextValue = UseMiniAppReturn;

const MiniAppContext = createContext<MiniAppContextValue | null>(null);

export function useMiniAppContext(): MiniAppContextValue {
  const ctx = useContext(MiniAppContext);
  if (!ctx) {
    throw new Error('useMiniAppContext must be used within MiniAppProvider');
  }
  return ctx;
}

export function MiniAppProvider({ children }: { children: React.ReactNode }) {
  const ma = useMiniApp();

  const value = useMemo<MiniAppContextValue>(() => ({ ...ma }), [ma]);

  return (
    <MiniAppContext.Provider value={value}>
      {children}
      {/* Portal-рендер кнопок в контейнер */}
      <MiniAppBottomBar />
    </MiniAppContext.Provider>
  );
}

/**
 * Рендерит BottomBar-компоненты в отдельный div внутри mini-app.
 * Используется только когда Mini App активен.
 */
function MiniAppBottomBar() {
  const ctx = useContext(MiniAppContext);
  if (!ctx) return null;

  return (
    <div id="mini-app-bottom-bar-root">
      <BackButton
        isVisible={true}
        isActive={true}
        onClick={ctx.clearBackHandler}
      />
      <SettingsButton
        isVisible={true}
        onClick={() => {
          ctx.showAlert('Настройки');
        }}
      />
    </div>
  );
}
