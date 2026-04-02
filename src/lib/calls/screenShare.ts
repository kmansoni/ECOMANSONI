/**
 * Утилита захвата экрана для звонков.
 * Получает MediaStream через getDisplayMedia API.
 */

import { logger } from '@/lib/logger';

/**
 * Запрашивает у пользователя выбор экрана/окна и возвращает MediaStream.
 * Бросает DOMException('NotAllowedError') при отмене пользователем.
 */
export async function acquireScreenStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('getDisplayMedia API недоступен в этом браузере');
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      } as MediaTrackConstraints,
      audio: false,
    });

    logger.info('[ScreenShare] Поток захвата экрана получен', {
      trackCount: stream.getTracks().length,
      label: stream.getVideoTracks()[0]?.label,
    });

    return stream;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      logger.info('[ScreenShare] Пользователь отменил выбор экрана');
      throw error;
    }
    logger.error('[ScreenShare] Ошибка захвата экрана', { error });
    throw error;
  }
}

/** Проверяет поддержку getDisplayMedia в текущем браузере. */
export function isScreenShareSupported(): boolean {
  return typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia;
}
