import { useState, useEffect, useCallback } from 'react';
import { mediaCache, CacheStats } from '@/lib/mediaCache';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'mansoni:storage-settings:v1';

export interface StorageSettings {
  autoDownloadPhotosWifi: boolean;
  autoDownloadPhotosMobile: boolean;
  autoDownloadVideoWifi: boolean;
  autoDownloadVideoMobile: boolean;
}

const DEFAULT_SETTINGS: StorageSettings = {
  autoDownloadPhotosWifi: true,
  autoDownloadPhotosMobile: true,
  autoDownloadVideoWifi: true,
  autoDownloadVideoMobile: false,
};

function loadSettings(): StorageSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    logger.warn('[useStorageSettings] Failed to load settings from localStorage', { error });
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: StorageSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (error) {
    logger.warn('[useStorageSettings] Failed to persist settings to localStorage', { error });
  }
}

export interface StorageSettingsHook {
  settings: StorageSettings;
  updateSettings: (partial: Partial<StorageSettings>) => void;
  cacheStats: { sizeMB: number; count: number };
  clearCache: () => Promise<void>;
  isClearing: boolean;
}

export function useStorageSettings(): StorageSettingsHook {
  const [settings, setSettings] = useState<StorageSettings>(loadSettings);
  const [cacheStats, setCacheStats] = useState<{ sizeMB: number; count: number }>({
    sizeMB: 0,
    count: 0,
  });
  const [isClearing, setIsClearing] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      const stats: CacheStats = await mediaCache.getStats();
      setCacheStats({
        sizeMB: parseFloat((stats.estimatedSizeBytes / (1024 * 1024)).toFixed(1)),
        count: stats.mediaCount,
      });
    } catch (error) {
      logger.warn('[useStorageSettings] Failed to refresh media cache stats', { error });
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const updateSettings = useCallback((partial: Partial<StorageSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const clearCache = useCallback(async () => {
    setIsClearing(true);
    try {
      await mediaCache.clear();
      await refreshStats();
    } finally {
      setIsClearing(false);
    }
  }, [refreshStats]);

  return {
    settings,
    updateSettings,
    cacheStats,
    clearCache,
    isClearing,
  };
}
