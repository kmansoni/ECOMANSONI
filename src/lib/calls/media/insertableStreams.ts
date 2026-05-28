import { getCallsConfig } from '@/lib/calls/config/callsConfig';
import { hasInsertableStreamsSupport } from '@/calls-v2'; // предполагаем, что такая функция существует в calls-v2

export function ensureInsertableStreamsAvailable(): { supported: boolean; errorMessage?: string } {
  const config = getCallsConfig();
  const supported = hasInsertableStreamsSupport();
  if (!supported && config.insertableStreamsRequired) {
    return {
      supported: false,
      errorMessage: 'Ваш браузер не поддерживает Insertable Streams, которые необходимы для защищённых звонков. Пожалуйста, обновите браузер или используйте другой.',
    };
  }
  if (!supported && !config.insertableStreamsRequired) {
    // fallback to audio-only
    return {
      supported: false,
      errorMessage: 'Ваш браузер не поддерживает Insertable Streams. Звонок будет переведён в аудио‑only режим.',
    };
  }
  return { supported: true };
}

// Функцию, которую можно вызвать перед началом видеозвонка, чтобы решить, включать ли видео.
export function shouldEnableVideo(): boolean {
  const result = ensureInsertableStreamsAvailable();
  return result.supported;
}