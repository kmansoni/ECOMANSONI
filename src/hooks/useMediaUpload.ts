/**
 * @module useMediaUpload
 * @description React hook для загрузки медиа через {@link uploadMedia}.
 *
 * Архитектурные решения:
 * - AbortController хранится в useRef, чтобы избежать stale closure в cancel().
 * - Cleanup на unmount: если загрузка идёт — автоматически abort().
 * - Состояние (progress, isUploading, error) — минимальное; нет лишних re-render.
 * - upload() возвращает Promise<UploadResult> → компонент может await и сразу использовать URL.
 * - Повторный вызов upload() во время активной загрузки отменяет предыдущую.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  uploadMedia,
  MediaUploadError,
  type UploadOptions,
  type UploadResult,
} from '@/lib/mediaUpload';

// ─── Return type ──────────────────────────────────────────────────────────────

export interface UseMediaUploadReturn {
  /**
   * Загрузить файл.
   *
   * Если уже идёт загрузка — предыдущая будет отменена (ABORTED).
   * AbortSignal управляется внутри hook; не передавайте свой signal в options.
   *
   * @param file    Файл или Blob.
   * @param options Опции загрузки (bucket, path, onProgress).
   *                Поле `signal` игнорируется — hook управляет им самостоятельно.
   * @returns       {@link UploadResult}
   * @throws        {@link MediaUploadError}
   */
  upload: (
    file: File | Blob,
    options: Omit<UploadOptions, 'signal'>,
  ) => Promise<UploadResult>;

  /** Прогресс текущей загрузки (0–100), null когда загрузки нет. */
  progress: number | null;

  /** true пока загрузка активна. */
  isUploading: boolean;

  /** Последняя ошибка загрузки. Сбрасывается при следующем вызове upload() или reset(). */
  error: MediaUploadError | null;

  /**
   * Отменить текущую загрузку.
   * Если загрузки нет — no-op.
   * После отмены error.code будет 'ABORTED'.
   */
  cancel: () => void;

  /** Сбросить состояние ошибки (error → null). */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React hook для загрузки медиа с отслеживанием прогресса и управлением отменой.
 *
 * @example
 * ```tsx
 * const { upload, progress, isUploading, error, cancel } = useMediaUpload();
 *
 * const handleFile = async (file: File) => {
 *   try {
 *     const result = await upload(file, { bucket: 'chat-media' });
 *     sendMessage(result.url);
 *   } catch (err) {
 *     if (err instanceof MediaUploadError && err.code === 'ABORTED') return;
 *     console.error('Upload failed', err);
 *   }
 * };
 * ```
 */
export function useMediaUpload(): UseMediaUploadReturn {
  const [progress, setProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<MediaUploadError | null>(null);

  // Храним AbortController в ref чтобы cancel() не был stale closure.
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Если компонент размонтирован во время загрузки — прерываем её.
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setError(null);
  }, []);

  // ── upload ────────────────────────────────────────────────────────────────
  const upload = useCallback(
    async (
      file: File | Blob,
      options: Omit<UploadOptions, 'signal'>,
    ): Promise<UploadResult> => {
      // Отменить предыдущую загрузку если она ещё идёт.
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Сбрасываем предыдущее состояние.
      setError(null);
      setProgress(0);
      setIsUploading(true);

      try {
        const result = await uploadMedia(file, {
          ...options,
          signal: controller.signal,
          onProgress: (percent: number) => {
            setProgress(percent);
            // Если caller тоже хочет прогресс — проксируем.
            options.onProgress?.(percent);
          },
        });

        return result;
      } catch (err) {
        const uploadError =
          err instanceof MediaUploadError
            ? err
            : new MediaUploadError(
                err instanceof Error ? err.message : 'Unknown error',
                'SERVER_ERROR',
                0,
              );
        setError(uploadError);
        throw uploadError;
      } finally {
        setIsUploading(false);
        setProgress(null);
        // Очищаем ref только если это тот же контроллер (не был заменён новым вызовом).
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
  );

  return { upload, progress, isUploading, error, cancel, reset };
}
