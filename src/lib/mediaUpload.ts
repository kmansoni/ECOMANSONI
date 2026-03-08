/**
 * @module mediaUpload
 * @description Единый клиентский модуль загрузки медиа через AdminVPS media-server.
 *
 * Архитектурные решения:
 * - XMLHttpRequest вместо fetch: только XHR поддерживает upload progress events (upload.onprogress).
 * - JWT из Supabase сессии: Bearer-токен в Authorization header; никогда не логируется.
 * - Fallback на Supabase Storage: если VITE_MEDIA_SERVER_URL не задан, используем supabase.storage
 *   для обратной совместимости в dev/CI без media-server.
 * - AbortSignal → XHR.abort(): при отмене генерируется ошибка с кодом ABORTED.
 * - Типизированные коды ошибок: позволяют UI точечно обрабатывать каждый сценарий.
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage, isCompressibleImage, COMPRESS_PRESETS } from '@/lib/imageCompressor';
import type { CompressOptions } from '@/lib/imageCompressor';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Допустимые bucket-идентификаторы media-server / Supabase Storage. */
export type MediaBucket =
  | 'media'
  | 'chat-media'
  | 'voice-messages'
  | 'post-media'
  | 'reels-media'
  | 'avatars'
  | 'stories-media';

/** Опции загрузки файла. */
export interface UploadOptions {
  /** Целевой bucket. */
  bucket: MediaBucket;
  /**
   * Опциональный путь внутри bucket.
   * Если не задан — media-server генерирует UUID-путь автоматически.
   */
  path?: string;
  /** Callback для отслеживания прогресса загрузки (0–100). */
  onProgress?: (percent: number) => void;
  /** AbortSignal для отмены загрузки. */
  signal?: AbortSignal;
}

/** Результат успешной загрузки. */
export interface UploadResult {
  /** Публичный URL загруженного файла. */
  url: string;
  /** URL thumbnail (для изображений и видео), null для аудио/прочих типов. */
  thumbnailUrl: string | null;
  /** Ширина в пикселях (изображения/видео), null иначе. */
  width: number | null;
  /** Высота в пикселях (изображения/видео), null иначе. */
  height: number | null;
  /** Итоговый размер файла в байтах (после обработки на сервере). */
  size: number;
  /** MIME-тип после серверной обработки (может отличаться от исходного). */
  mimeType: string;
  /** Bucket, в который загружен файл. */
  bucket: MediaBucket;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/** Типизированный код ошибки загрузки. */
export type MediaUploadErrorCode =
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'ABORTED'
  | 'SERVER_ERROR';

/**
 * Ошибка загрузки медиа с типизированным кодом и HTTP-статусом.
 *
 * Используйте `error.code` для условной логики в UI:
 * - `NETWORK` — нет связи с media-server; предложи повтор.
 * - `UNAUTHORIZED` — сессия истекла; редиректни на логин.
 * - `TOO_LARGE` — файл превышает лимит; покажи допустимый размер.
 * - `UNSUPPORTED_TYPE` — MIME-тип не принят сервером.
 * - `ABORTED` — загрузка отменена пользователем.
 * - `SERVER_ERROR` — внутренняя ошибка media-server (5xx).
 */
export class MediaUploadError extends Error {
  readonly code: MediaUploadErrorCode;
  readonly status: number;

  constructor(message: string, code: MediaUploadErrorCode, status: number) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
    this.status = status;
    // Restore prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MEDIA_SERVER_URL: string | undefined =
  import.meta.env.VITE_MEDIA_SERVER_URL as string | undefined;

/**
 * Получить JWT из текущей Supabase сессии.
 * Возвращает null если сессия отсутствует (анонимный пользователь).
 * JWT никогда не попадает в логи.
 */
async function getJwt(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

/**
 * Сопоставить HTTP-статус с типизированным кодом ошибки.
 */
function httpStatusToCode(status: number): MediaUploadErrorCode {
  if (status === 0) return 'NETWORK';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 413) return 'TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_TYPE';
  return 'SERVER_ERROR';
}

// ─── Supabase Storage fallback ────────────────────────────────────────────────

/**
 * Fallback-загрузка через Supabase Storage.
 * Активируется когда VITE_MEDIA_SERVER_URL не задан (dev/CI без media-server).
 * Не поддерживает onProgress (Supabase JS SDK v2 не предоставляет upload progress).
 *
 * @throws MediaUploadError при ошибках Storage API.
 */
async function uploadViaSupabase(
  file: File | Blob,
  options: UploadOptions,
): Promise<UploadResult> {
  const fileName =
    options.path ??
    `${crypto.randomUUID()}.${
      file instanceof File ? file.name.split('.').pop() ?? 'bin' : 'bin'
    }`;

  const { data, error } = await supabase.storage
    .from(options.bucket)
    .upload(fileName, file, { upsert: false });

  if (error) {
    // Supabase Storage errors do not carry HTTP status in the same shape;
    // map known messages to codes.
    const msg = error.message ?? '';
    const code: MediaUploadErrorCode = msg.includes('JWT') ? 'UNAUTHORIZED' : 'SERVER_ERROR';
    throw new MediaUploadError(`Supabase Storage: ${msg}`, code, 0);
  }

  const { data: publicData } = supabase.storage
    .from(options.bucket)
    .getPublicUrl(data.path);

  return {
    url: publicData.publicUrl,
    thumbnailUrl: null,
    width: null,
    height: null,
    size: file.size,
    mimeType: file instanceof File ? file.type : 'application/octet-stream',
    bucket: options.bucket,
  };
}

// ─── Core upload via media-server ─────────────────────────────────────────────

/**
 * Загрузить файл через XHR на media-server.
 * XHR используется намеренно: Fetch API не предоставляет upload progress events.
 *
 * @throws MediaUploadError — при любых ошибках (сеть, авторизация, валидация, abort).
 */
async function uploadViaMediaServer(
  file: File | Blob,
  options: UploadOptions,
  jwt: string | null,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // ── AbortSignal wiring ──────────────────────────────────────────────────
    const { signal } = options;
    if (signal?.aborted) {
      reject(new MediaUploadError('Upload aborted', 'ABORTED', 0));
      return;
    }
    const abortListener = () => {
      xhr.abort();
    };
    signal?.addEventListener('abort', abortListener, { once: true });

    // ── Progress tracking ───────────────────────────────────────────────────
    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (ev: ProgressEvent) => {
        if (ev.lengthComputable && options.onProgress) {
          const percent = Math.round((ev.loaded / ev.total) * 100);
          options.onProgress(percent);
        }
      });
    }

    // ── XHR event handlers ──────────────────────────────────────────────────
    xhr.addEventListener('load', () => {
      signal?.removeEventListener('abort', abortListener);

      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed: UploadResult;
        try {
          const raw = JSON.parse(xhr.responseText) as {
            url: string;
            thumbnailUrl?: string | null;
            width?: number | null;
            height?: number | null;
            size: number;
            mimeType: string;
          };
          parsed = {
            url: raw.url,
            thumbnailUrl: raw.thumbnailUrl ?? null,
            width: raw.width ?? null,
            height: raw.height ?? null,
            size: raw.size,
            mimeType: raw.mimeType,
            bucket: options.bucket,
          };
        } catch {
          reject(
            new MediaUploadError(
              'Invalid JSON response from media-server',
              'SERVER_ERROR',
              xhr.status,
            ),
          );
          return;
        }
        resolve(parsed);
      } else {
        const code = httpStatusToCode(xhr.status);
        let detail = '';
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string };
          detail = body.message ?? '';
        } catch {
          /* ignore parse errors for error responses */
        }
        reject(
          new MediaUploadError(
            detail || `HTTP ${xhr.status}`,
            code,
            xhr.status,
          ),
        );
      }
    });

    xhr.addEventListener('error', () => {
      signal?.removeEventListener('abort', abortListener);
      reject(new MediaUploadError('Network error', 'NETWORK', 0));
    });

    xhr.addEventListener('abort', () => {
      signal?.removeEventListener('abort', abortListener);
      reject(new MediaUploadError('Upload aborted', 'ABORTED', 0));
    });

    xhr.addEventListener('timeout', () => {
      signal?.removeEventListener('abort', abortListener);
      reject(new MediaUploadError('Upload timed out', 'NETWORK', 0));
    });

    // ── Build FormData ──────────────────────────────────────────────────────
    const form = new FormData();
    form.append('file', file);
    form.append('bucket', options.bucket);
    if (options.path) {
      form.append('path', options.path);
    }

    // ── Open & send ─────────────────────────────────────────────────────────
    xhr.open('POST', `${MEDIA_SERVER_URL}/api/upload`);
    if (jwt) {
      // Set Authorization header; JWT value intentionally not logged.
      xhr.setRequestHeader('Authorization', `Bearer ${jwt}`);
    }
    xhr.send(form);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Загрузить файл на media-server (AdminVPS).
 *
 * При отсутствии `VITE_MEDIA_SERVER_URL` автоматически использует
 * Supabase Storage (fallback для dev/CI).
 *
 * Использует XMLHttpRequest для поддержки upload progress events.
 * JWT берётся из текущей Supabase сессии и передаётся в Authorization header.
 *
 * @param file    Файл или Blob для загрузки.
 * @param options Опции: bucket, path, onProgress, signal.
 * @returns       {@link UploadResult} с публичным URL и метаданными.
 * @throws        {@link MediaUploadError} при ошибках сети, авторизации, валидации или отмене.
 *
 * @example
 * ```ts
 * const result = await uploadMedia(file, {
 *   bucket: 'chat-media',
 *   onProgress: (p) => setProgress(p),
 *   signal: abortController.signal,
 * });
 * console.log(result.url);
 * ```
 */
/**
 * Определить пресет сжатия по идентификатору bucket.
 * Возвращает undefined для бакетов, которые не содержат изображения (voice-messages, reels-media).
 *
 * @internal
 */
function getCompressPresetForBucket(bucket: MediaBucket): CompressOptions | undefined {
  switch (bucket) {
    case 'avatars':
      return COMPRESS_PRESETS.avatar;
    case 'chat-media':
      return COMPRESS_PRESETS.chat;
    case 'media':
    case 'post-media':
    case 'stories-media':
      return COMPRESS_PRESETS.post;
    // voice-messages и reels-media — аудио/видео, не сжимаем
    case 'voice-messages':
    case 'reels-media':
    default:
      return undefined;
  }
}

export async function uploadMedia(
  file: File | Blob,
  options: UploadOptions,
): Promise<UploadResult> {
  // ── Client-side image compression ──────────────────────────────────────────
  // Сжимаем только File (не Blob без имени) и только изображения.
  // Видео, аудио и прочие типы передаются напрямую.
  let uploadFile: File | Blob = file;

  if (file instanceof File && isCompressibleImage(file)) {
    const preset = getCompressPresetForBucket(options.bucket);
    if (preset) {
      try {
        const result = await compressImage(file, preset);
        if (result.wasCompressed) {
          const ratio = Math.round((1 - result.compressedSize / result.originalSize) * 100);
          console.debug(
            `[mediaUpload] compressed ${result.originalSize} → ${result.compressedSize} (-${ratio}%)`,
            { bucket: options.bucket, dims: `${result.width}×${result.height}` },
          );
          uploadFile = result.file;
        }
      } catch (compressErr) {
        // Сжатие не является критической операцией —
        // при любой ошибке Canvas API загружаем оригинал.
        console.warn('[mediaUpload] compression failed, uploading original:', compressErr);
        uploadFile = file;
      }
    }
  }

  if (!MEDIA_SERVER_URL) {
    // Fallback: Supabase Storage (dev/CI без media-server).
    return uploadViaSupabase(uploadFile, options);
  }

  const jwt = await getJwt();
  return uploadViaMediaServer(uploadFile, options, jwt);
}

/**
 * Удалить файл с media-server.
 *
 * Парсит переданный URL чтобы извлечь bucket и key.
 * Требует валидной Supabase сессии (JWT).
 * Только автор файла или пользователь с ролью admin может удалить файл.
 *
 * @param url Публичный URL файла, ранее возвращённый {@link uploadMedia}.
 * @throws    {@link MediaUploadError} при ошибках авторизации или сети.
 *
 * @example
 * ```ts
 * await deleteMedia('https://media.mansoni.ru/chat-media/abc/image.webp');
 * ```
 */
export async function deleteMedia(url: string): Promise<void> {
  if (!MEDIA_SERVER_URL) {
    // В fallback-режиме (Supabase Storage) разбираем URL иначе.
    // Supabase public URL: .../storage/v1/object/public/{bucket}/{key}
    const supabaseMatch = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url);
    if (!supabaseMatch) {
      throw new MediaUploadError('Cannot parse Supabase Storage URL', 'SERVER_ERROR', 0);
    }
    const [, bucket, key] = supabaseMatch;
    const { error } = await supabase.storage.from(bucket).remove([key]);
    if (error) {
      throw new MediaUploadError(`Supabase Storage remove: ${error.message}`, 'SERVER_ERROR', 0);
    }
    return;
  }

  // Media-server URL structure: {MEDIA_SERVER_URL}/{bucket}/{key...}
  // После Nginx: https://media.mansoni.ru/{bucket}/{...key}
  // Key МОЖЕТ содержать слэши (вложенные папки):
  //   формат ключа после fix: {userId}/{timestamp}_{uuid}.{ext}
  //
  // КРИТИЧНО: НЕ используем encodeURIComponent(key) целиком — он кодирует '/'
  //   в '%2F', и Fastify wildcard-маршрут /api/media/:bucket/* перестаёт
  //   матчить путь, возвращая 404.
  //   Решение: кодируем каждый сегмент пути отдельно, сохраняя '/' как разделители.
  const serverOrigin = new URL(MEDIA_SERVER_URL).origin;
  let relativePath: string;
  try {
    const parsed = new URL(url);
    // Убираем лидирующий слэш
    relativePath = parsed.pathname.replace(/^\//, '');
  } catch {
    throw new MediaUploadError('Invalid media URL', 'SERVER_ERROR', 0);
  }

  // relativePath = "{bucket}/{key}"
  const slashIdx = relativePath.indexOf('/');
  if (slashIdx === -1) {
    throw new MediaUploadError('Cannot extract bucket/key from URL', 'SERVER_ERROR', 0);
  }
  const bucket = relativePath.slice(0, slashIdx);
  const key = relativePath.slice(slashIdx + 1);

  // Encode each path segment independently so slashes are preserved in the URL
  // and Fastify wildcard route /api/media/:bucket/* matches correctly.
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');

  const jwt = await getJwt();

  const response = await fetch(
    `${serverOrigin}/api/media/${encodeURIComponent(bucket)}/${encodedKey}`,
    {
      method: 'DELETE',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    },
  );

  if (!response.ok) {
    const code = httpStatusToCode(response.status);
    let detail = '';
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ?? '';
    } catch {
      /* ignore */
    }
    throw new MediaUploadError(detail || `HTTP ${response.status}`, code, response.status);
  }
}
