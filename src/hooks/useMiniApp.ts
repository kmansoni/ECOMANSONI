/**
 * useMiniApp — React hook для unified Mini App bridge.
 *
 * Работает в Telegram WebApp и в обычном браузере (fallback на Web API).
 */

import { useState, useEffect } from 'react';
import {
  // Lifecycle & state
  ready, expand, close, init as initMiniApp,
  getPlatform, getVersion, getColorScheme, getThemeParams,
  isDesktop, isMobile,
  setHeaderColor, setBackgroundColor, getColorSchemeColors,
  isFullscreen, isOrientationLocked, isActive,
  getViewportHeight, getViewportStableHeight,
  getSafeArea, getContentSafeArea,
  requestFullscreen, exitFullscreen,
  lockOrientation, unlockOrientation,
  enableVerticalSwipes, disableVerticalSwipes, isVerticalSwipesEnabled,
  // Storage
  cloudStorage, secureStorage, sessionStorage, deviceStorage,
  // Sensors
  accelerometer, gyroscope, deviceOrientation,
  // Geolocation
  getLocation, location, locationManager,
  // Haptics
  haptic,
  // QR Scanner
  openQRScanner, closeQRScanner, isQRScannerSupported,
  // Contacts
  requestContact, requestWriteAccess,
  // Files
  downloadFile, shareFiles,
  // Emoji status
  requestEmojiStatusAccess, setEmojiStatus, showEmojiStatus,
  // Navigation & sharing
  switchInlineQuery, openLink, openTelegramLink, openInvoice,
  shareToStory, shareMessage, readTextFromClipboard,
  // Swipe / chat
  setSwipeBehavior, requestChat,
  // Init Data
  getInitData, getInitDataRaw,
  // Buttons
  MainButton, SecondaryButton, SettingsButton, BackButton,
  // Theme
  getFlashMode, setFlashMode,
  // Events
  onFullscreenChange, onOrientationChange, onViewportChange, onActiveChange,
  onInvoiceClose, onPopupClosed, onFlashModeChange,
  onAccelerometerChange, onGyroscopeChange, onDeviceOrientationChange, onLocationUpdate,
  offFullscreenChange, offOrientationChange, offViewportChange, offActiveChange,
  offInvoiceClose, offPopupClosed, offFlashModeChange,
  offAccelerometerChange, offGyroscopeChange, offDeviceOrientationChange, offLocationUpdate,
  // Biometric
  biometric, requestBiometricAccess,
  // Misc
  sendData, getDeviceInfo,
  hideKeyboard,
  // Dialogs
  showPopup, showAlert, showConfirm,
  // Additional API
  addToHomeScreen, checkHomeScreenStatus,
} from '@/lib/mini-app';

import type { UseMiniAppReturn } from './useMiniApp.types';

export function useMiniApp(): UseMiniAppReturn {
  const [state, setState] = useState({
    platform: getPlatform(),
    version: getVersion(),
    colorScheme: getColorScheme() as 'light' | 'dark',
    themeParams: getThemeParams() as Record<string, string>,
    isFullscreen: isFullscreen(),
    isOrientationLocked: isOrientationLocked(),
    isActive: isActive(),
    viewportHeight: getViewportHeight(),
    viewportStableHeight: getViewportStableHeight(),
    flashMode: getFlashMode(),
  });

  useEffect(() => {
    const unsubFull = onFullscreenChange((v) => setState(s => ({ ...s, isFullscreen: v })));
    const unsubActive = onActiveChange((v) => setState(s => ({ ...s, isActive: v })));
    const unsubViewport = onViewportChange((v) => setState(s => ({ ...s, viewportHeight: v.height })));
    const unsubFlash = onFlashModeChange((m) => setState(s => ({ ...s, flashMode: m })));
    const unsubOrientation = onOrientationChange(() => setState(s => ({ ...s, isOrientationLocked: true })));

    return () => {
      unsubFull?.();
      unsubActive?.();
      unsubViewport?.();
      unsubFlash?.();
      unsubOrientation?.();
    };
  }, []);

  return {
    ...state,
    ready,
    expand,
    close,
    init: initMiniApp,
    setHeaderColor,
    setBackgroundColor,
    getColorSchemeColors,
    requestFullscreen,
    exitFullscreen,
    lockOrientation: (o) => lockOrientation(o as any),
    unlockOrientation,
    isVerticalSwipesEnabled,
    enableVerticalSwipes,
    disableVerticalSwipes,
    getFlashMode,
    setFlashMode,
    showMainButton: MainButton.show,
    hideMainButton: MainButton.hide,
    setMainButton: MainButton.setText,
    onMainButtonClick: MainButton.onClick,
    offMainButtonClick: MainButton.offClick,
    showSecondaryButton: SecondaryButton.show,
    hideSecondaryButton: SecondaryButton.hide,
    setSecondaryButton: SecondaryButton.setText,
    onSecondaryButtonClick: SecondaryButton.onClick,
    showBackButton: BackButton.show,
    hideBackButton: BackButton.hide,
    onBackButtonClick: BackButton.onClick,
    offBackButtonClick: BackButton.offClick,
    showPopup,
    showConfirm,
    showAlert,
    onFullscreenChange,
    offFullscreenChange,
    onOrientationChange,
    offOrientationChange,
    onViewportChange,
    offViewportChange,
    onActiveChange,
    offActiveChange,
    onInvoiceClose,
    offInvoiceClose,
    onPopupClosed,
    offPopupClosed,
    onFlashModeChange,
    offFlashModeChange,
    onAccelerometerChange,
    offAccelerometerChange,
    onGyroscopeChange,
    offGyroscopeChange,
    onDeviceOrientationChange,
    offDeviceOrientationChange,
    onLocationUpdate,
    offLocationUpdate,
    storage: cloudStorage,
    secure: secureStorage,
    session: sessionStorage,
    deviceStorage,
    accelerometerApi: accelerometer,
    gyroscopeApi: gyroscope,
    deviceOrientationApi: deviceOrientation,
    location,
    getLocationApi: () => getLocation(),
    locationManagerApi: locationManager,
    scanQR: openQRScanner,
    isQRScannerSupported,
    contact: { request: requestContact },
    writeAccess: requestWriteAccess,
    hapticApi: haptic,
    biometricApi: biometric,
    requestBiometricAccess,
    files: {
      download: (id, sec = true) => downloadFile(id, sec),
      share: (files) => shareFiles(files as any),
    },
    clipboard: { readText: readTextFromClipboard },
    initData: getInitData(),
    initDataRaw: getInitDataRaw(),
    sendData,
    getDeviceInfo,
    // Additional API
    switchInlineQuery,
    openLink,
    openTelegramLink,
    openInvoice,
    shareToStory,
    showEmojiStatus,
    setEmojiStatus,
    requestEmojiStatusAccess,
    setSwipeBehavior,
    requestChat,
    addToHomeScreen,
    checkHomeScreenStatus,
    hideKeyboard,
    // Backward-compatible (deprecated)
    setBackHandler: (cb: () => void) => BackButton.onClick(cb),
    clearBackHandler: () => BackButton.offClick(),
    // Button objects
    mainButton: MainButton,
    secondaryButton: SecondaryButton,
    settingsButton: SettingsButton,
  } as UseMiniAppReturn;
}
