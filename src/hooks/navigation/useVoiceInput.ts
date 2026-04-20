/**
 * useVoiceInput — Хук распознавания речи для голосового ввода адреса.
 * Использует Web Speech API (SpeechRecognition).
 *
 * Поток: пользователь нажимает кнопку → говорит адрес →
 * система распознаёт → промежуточные результаты видны в реальном времени →
 * финальный текст возвращается через onResult.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getCurrentLanguageCode } from '@/lib/localization/appLocale';

export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

interface UseVoiceInputOptions {
  /** Язык распознавания (по умолчанию runtime locale) */
  lang?: string;
  /** Непрерывное распознавание (по умолчанию false — одна фраза) */
  continuous?: boolean;
  /** Показывать промежуточные результаты */
  interimResults?: boolean;
}

export interface UseVoiceInputReturn {
  /** Текущее состояние */
  state: VoiceInputState;
  /** Распознанный текст (обновляется в реальном времени) */
  transcript: string;
  /** Промежуточный текст (пока пользователь говорит) */
  interimTranscript: string;
  /** Финальный распознанный текст */
  finalTranscript: string;
  /** Альтернативные варианты распознавания (менее уверенные) */
  alternatives: string[];
  /** Ошибка (если есть) */
  error: string | null;
  /** Поддерживается ли Speech Recognition в браузере */
  isSupported: boolean;
  /** Начать прослушивание */
  startListening: () => void;
  /** Остановить прослушивание */
  stopListening: () => void;
  /** Сбросить состояние */
  reset: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    lang = getCurrentLanguageCode() === 'ru' ? 'ru-RU' : 'en-US',
    continuous = false,
    interimResults = true,
  } = options;
  const isRussianUi = lang.toLowerCase().startsWith('ru');

  const [state, setState] = useState<VoiceInputState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStoppingRef = useRef(false);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        isStoppingRef.current = true;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError(isRussianUi ? 'Распознавание речи не поддерживается в этом браузере' : 'Speech recognition is not supported in this browser');
      setState('error');
      return;
    }

    // Остановить предыдущий экземпляр
    if (recognitionRef.current) {
      isStoppingRef.current = true;
      recognitionRef.current.abort();
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setFinalTranscript('');
    setAlternatives([]);
    isStoppingRef.current = false;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setError(isRussianUi ? 'SpeechRecognition недоступен' : 'SpeechRecognition is unavailable');
      setState('error');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 5;

    recognition.onstart = () => {
      setState('listening');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      const alts: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          final += text;
          // Собираем альтернативные варианты (менее уверенные)
          for (let j = 1; j < result.length; j++) {
            const alt = result[j].transcript.trim();
            if (alt && alt !== text.trim()) {
              alts.push(alt);
            }
          }
        } else {
          interim += text;
        }
      }

      if (final) {
        setFinalTranscript(prev => prev + final);
        setTranscript(prev => prev + final);
        setInterimTranscript('');
        if (alts.length > 0) setAlternatives(alts);
      } else {
        setInterimTranscript(interim);
        setTranscript(prev => {
          // Показать финальный + промежуточный
          const base = prev.replace(/\s*$/, '');
          return base ? `${base} ${interim}` : interim;
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isStoppingRef.current) return; // Игнорируем ошибки при остановке

      const errorMessages: Record<string, string> = {
        'no-speech': isRussianUi ? 'Речь не обнаружена. Попробуйте ещё раз.' : 'No speech detected. Please try again.',
        'audio-capture': isRussianUi ? 'Микрофон не найден. Проверьте подключение.' : 'No microphone detected. Check your device.',
        'not-allowed': isRussianUi ? 'Доступ к микрофону запрещён. Разрешите в настройках браузера.' : 'Microphone access is blocked. Allow it in your browser settings.',
        'network': isRussianUi ? 'Ошибка сети. Проверьте подключение к интернету.' : 'Network error. Check your internet connection.',
        'aborted': isRussianUi ? 'Распознавание отменено.' : 'Recognition was cancelled.',
        'language-not-supported': isRussianUi ? 'Язык не поддерживается.' : 'This language is not supported.',
        'service-not-allowed': isRussianUi ? 'Сервис распознавания недоступен.' : 'Speech recognition service is unavailable.',
      };

      const msg = errorMessages[event.error] || (isRussianUi ? `Ошибка распознавания: ${event.error}` : `Recognition error: ${event.error}`);
      setError(msg);
      setState('error');
    };

    recognition.onend = () => {
      if (!isStoppingRef.current) {
        setState(prev => prev === 'error' ? 'error' : 'idle');
      }
      recognitionRef.current = null;
    };

    recognition.onspeechend = () => {
      setState('processing');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setError(isRussianUi ? 'Не удалось запустить распознавание речи' : 'Failed to start speech recognition');
      setState('error');
    }
  }, [continuous, interimResults, isRussianUi, isSupported, lang]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      isStoppingRef.current = true;
      recognitionRef.current.stop();
      setState('idle');
    }
  }, []);

  const reset = useCallback(() => {
    if (recognitionRef.current) {
      isStoppingRef.current = true;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setState('idle');
    setTranscript('');
    setInterimTranscript('');
    setFinalTranscript('');
    setAlternatives([]);
    setError(null);
  }, []);

  return {
    state,
    transcript,
    interimTranscript,
    finalTranscript,
    alternatives,
    error,
    isSupported,
    startListening,
    stopListening,
    reset,
  };
}
