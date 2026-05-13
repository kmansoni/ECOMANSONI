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

interface MiniAppContextValue extends UseMiniAppReturn {
  // Convenience shortcuts
  showPopup: (params: { title?: string; message: string; buttons?: any[] }) => Promise<{ ok: boolean; result?: string }>;
  showConfirm: (message: string) => Promise<{ ok: boolean; result: boolean }>;
  showAlert: (message: string) => Promise<{ ok: boolean }>;
  close: () => void;
  expand: () => void;
  mainButton: typeof import('@/components/MainButton').MainButton;
  setBackHandler: (cb: () => void) => void;
  clearBackHandler: () => void;
}

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

  const value = useMemo<MiniAppContextValue>(
    () => ({
      ...ma,
      showPopup: ma.showPopup,
      showConfirm: ma.showConfirm,
      showAlert: ma.showAlert,
      close: ma.close,
      expand: ma.expand,
      mainButton: ma.mainButton,
      setBackHandler: ma.setBackHandler,
      clearBackHandler: ma.clearBackHandler,
    }),
    [
      ma.ready, ma.expand, ma.close, ma.init,
      ma.platform, ma.version, ma.isMobile, ma.isDesktop,
      ma.colorScheme, ma.themeParams, ma.isFullscreen, ma.isOrientationLocked,
      ma.isActive, ma.viewportHeight, ma.viewportStableHeight, ma.flashMode,
      ma.setHeaderColor, ma.setBackgroundColor, ma.getColorSchemeColors,
      ma.requestFullscreen, ma.exitFullscreen, ma.lockOrientation, ma.unlockOrientation,
      ma.isVerticalSwipesEnabled, ma.enableVerticalSwipes, ma.disableVerticalSwipes,
      ma.showMainButton, ma.hideMainButton, ma.setMainButton, ma.onMainButtonClick, ma.offMainButtonClick,
      ma.showSecondaryButton, ma.hideSecondaryButton, ma.setSecondaryButton, ma.onSecondaryButtonClick,
      ma.showBackButton, ma.hideBackButton, ma.onBackButtonClick, ma.offBackButtonClick,
      ma.showPopup, ma.showConfirm, ma.showAlert,
      ma.onFullscreenChange, ma.offFullscreenChange, ma.onOrientationChange, ma.offOrientationChange,
      ma.onViewportChange, ma.offViewportChange, ma.onActiveChange, ma.offActiveChange,
      ma.onInvoiceClose, ma.offInvoiceClose, ma.onPopupClosed, ma.offPopupClosed,
      ma.onFlashModeChange, ma.offFlashModeChange,
      ma.onAccelerometerChange, ma.offAccelerometerChange, ma.onGyroscopeChange, ma.offGyroscopeChange,
      ma.onDeviceOrientationChange, ma.offDeviceOrientationChange, ma.onLocationUpdate, ma.offLocationUpdate,
      ma.storage, ma.secure, ma.session,
      ma.accelerometerApi, ma.gyroscopeApi, ma.deviceOrientationApi,
      ma.getLocationApi, ma.locationManagerApi,
      ma.scanQR, ma.contact, ma.writeAccess, ma.hapticApi, ma.biometricApi,
      ma.files, ma.clipboard, ma.initData, ma.initDataRaw,
      ma.sendData, ma.getDeviceInfo,
      ma.setBackHandler, ma.clearBackHandler,
      ma.mainButton,
    ]
  );

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
