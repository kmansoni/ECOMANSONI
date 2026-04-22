/**
 * surveyStore — состояние сессии сканирования (Zustand)
 * Хранит: текущие фото, трек, настройки, прогресс
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SurveySession,
  SurveySettings,
  SurveyScanType,
  CapturedPhoto,
  LatLngWithAlt,
  ComputedDimensions
} from '@/types/survey';

interface SurveyStore extends SurveySession {
  // Settings
  settings: SurveySettings;

  // Actions
  startSession: (mode: SurveyScanType) => Promise<void>;
  stopSession: () => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;

  // Photo capture
  addPhoto: (photo: CapturedPhoto) => void;
  removePhoto: (index: number) => void;
  clearPhotos: () => void;

  // GPS track
  addTrackPoint: (point: LatLngWithAlt) => void;
  clearTrack: () => void;

  // Quality monitoring (real-time)
  updateQuality: (score: number) => void;
  updateCurrentDimensions: (dims: ComputedDimensions) => void;

  // Upload
  uploadSession: () => Promise<{ success: boolean; scanId?: string; error?: string }>;

  // Error handling
  setError: (msg: string) => void;
  clearError: () => void;

  // Reset
  reset: () => void;
}

const DEFAULT_SETTINGS: SurveySettings = {
  enabled: true,
  autoMode: true,
  backgroundScanning: false,
  wifiOnly: true,
  quality: 'high',
  minOverlapPercent: 70,
  showLiveLayer: true,
  contributePublicly: true
};

const INITIAL_SESSION: SurveySession = {
  isActive: false,
  mode: null,
  photos: [],
  track: [],
  startTime: null,
  currentQuality: 0,
  status: 'idle',
  errorMessage: undefined,
  computedDimensions: undefined,
  uploadedScanId: undefined
};

export const useSurveyStore = create<SurveyStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_SESSION,
      settings: DEFAULT_SETTINGS,

      startSession: async (mode: SurveyScanType) => {
        const state = get();

        if (state.isActive) {
          throw new Error('Session already active');
        }

        set({
          isActive: true,
          mode,
          status: 'capturing',
          startTime: Date.now(),
          photos: [],
          track: [],
          currentQuality: 0,
          errorMessage: undefined,
          uploadedScanId: undefined
        });

        logger.info('[surveyStore] Session started', { mode });
      },

      stopSession: async () => {
        const state = get();

        if (!state.isActive) return;

        set({ status: 'processing' });

        try {
          // Upload all photos + metadata
          const result = await get().uploadSession();

          if (result.success && result.scanId) {
            set({
              isActive: false,
              status: 'completed',
              uploadedScanId: result.scanId
            });
            logger.info('[surveyStore] Session completed', { scanId: result.scanId });
          } else {
            throw new Error(result.error || 'Upload failed');
          }
        } catch (error) {
          set({
            isActive: false,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
          logger.error('[surveyStore] Session failed', { error });
        }
      },

      pauseSession: () => {
        set({ isActive: false });
        logger.info('[surveyStore] Session paused');
      },

      resumeSession: () => {
        if (!get().mode) return;
        set({ isActive: true });
        logger.info('[surveyStore] Session resumed');
      },

      addPhoto: (photo: CapturedPhoto) => {
        set((state) => ({
          photos: [...state.photos, photo]
        }));

        // Обновляем quality на основе последнего фото
        const avgQuality = get().photos.reduce((sum, p) => sum + p.qualityScore, 0) / (get().photos.length + 1);
        get().updateQuality(Math.round(avgQuality * 100) / 100);
      },

      removePhoto: (index: number) => {
        set((state) => ({
          photos: state.photos.filter((_, i) => i !== index)
        }));
      },

      clearPhotos: () => {
        set({ photos: [] });
      },

      addTrackPoint: (point: LatLngWithAlt) => {
        set((state) => ({
          track: [...state.track, point]
        }));
      },

      clearTrack: () => {
        set({ track: [] });
      },

      updateQuality: (score: number) => {
        set({ currentQuality: score });
      },

      updateCurrentDimensions: (dims: ComputedDimensions) => {
        set({ computedDimensions: dims });
      },

      uploadSession: async () => {
        const state = get();

        if (state.photos.length === 0) {
          return { success: false, error: 'No photos to upload' };
        }

        try {
          const surveyUploader = typeof window !== 'undefined'
            ? (window as Window & {
                uploadMedia?: (file: File | Blob, options: {
                  bucket: string;
                  path: string;
                  onProgress?: (progress: number) => void;
                }) => Promise<{ url: string }>;
              }).uploadMedia
            : undefined;

          if (!surveyUploader) {
            throw new Error('Survey upload contract missing: wire a survey uploader and register the survey-scans bucket before enabling capture.');
          }

          // 1. Загружаем все фото параллельно
          const uploadPromises = state.photos.map(async (photo, idx) => {
            // Проверяем, не загружено ли уже (для resume)
            if (photo.uploaded) {
              return { url: photo.url, index: idx };
            }

            // Используем compression на iOS/Android
            const file = photo.file instanceof File ? photo.file : new File([photo.file], `scan-${idx}.jpg`);

            const result = await surveyUploader(file, {
              bucket: 'survey-scans',
              path: `session-${Date.now()}/${idx}.jpg`,
              onProgress: (p: number) => {
                // Можно обновить прогресс в store
                set((s) => ({
                  photos: s.photos.map((p, i) =>
                    i === idx ? { ...p, uploadProgress: p } : p
                  )
                }));
              }
            });

            return { url: result.url, index: idx };
          });

          const results = await Promise.all(uploadPromises);
          const imageUrls = results.sort((a, b) => a.index - b.index).map(r => r.url);

          // 2. Собираем GPS track как LINESTRING
          const trackWKT = state.track.length >= 2
            ? `LINESTRING(${state.track.map(p => `${p.lng} ${p.lat}`).join(', ')})`
            : null;

          // 3. Метаданные
          const metadata: SurveySessionMetadata = {
            capture_mode: 'auto',  // определяется в SurveyCapturePage
            device_model: (navigator as any).userAgentData?.platform || 'unknown',
            os_version: 'web',  // будет перезаписано нативно
            camera_facing: 'back',
            photo_count: state.photos.length,
            avg_gps_accuracy_m: state.track.reduce((sum, p) => sum + (p.accuracy || 5), 0) / (state.track.length || 1),
            track_length_m: computeTrackLength(state.track),
            duration_sec: state.startTime ? (Date.now() - state.startTime) / 1000 : 0,
            capture_settings: {
              keyframe_interval_m: 2.5,
              min_overlap_pct: get().settings.minOverlapPercent,
              compression_quality: 85
            }
          };

          // 4. Создаём запись в БД через surveyService
          const { createSurveyScan } = await import('@/lib/survey/surveyService');
          const scan = await createSurveyScan({
            scan_type: state.mode || 'area',
            images: imageUrls,
            metadata,
            track_linestring: trackWKT ?? null
          });

          if (!scan) {
            throw new Error('Failed to create survey scan');
          }

          // 5. Помечаем фото как загруженные
          set((s) => ({
            photos: s.photos.map((p, i) => ({ ...p, uploaded: true, url: imageUrls[i] }))
          }));

          return { success: true, scanId: scan.id };
        } catch (error) {
          logger.error('[surveyStore] uploadSession failed', { error });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
          };
        }
      },

      setError: (msg: string) => {
        set({ status: 'error', errorMessage: msg });
      },

      clearError: () => {
        set({ errorMessage: undefined });
      },

      reset: () => {
        set({
          ...INITIAL_SESSION,
          settings: get().settings  // сохраняем настройки
        });
      }
    }),
    {
      name: 'mansoni-survey-store',
      partialize: (state) => ({
        // Сохраняем только настройки, не сессию
        settings: state.settings
      })
    }
  )
);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function computeTrackLength(track: LatLngWithAlt[]): number {
  if (track.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < track.length; i++) {
    const prev = track[i - 1];
    const curr = track[i];
    // Haversine distance in meters
    const R = 6371000; // Earth radius in meters
    const lat1 = (prev.lat * Math.PI) / 180;
    const lat2 = (curr.lat * Math.PI) / 180;
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLon = ((curr.lng - prev.lng) * Math.PI) / 180;

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    total += R * c;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = {
  info: (msg: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.log(`[surveyStore] ${msg}`, meta || '');
    }
  },
  error: (msg: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.error(`[surveyStore] ${msg}`, meta || '');
    }
  }
};
