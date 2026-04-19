/**
 * VoiceSearchSheet — Экран голосового ввода адреса.
 *
 * Поток: пользователь нажимает кнопку микрофона → открывается sheet →
 * система слушает → показывает распознанный текст →
 * автоматически ищет адрес → пользователь выбирает / подтверждает → маршрут строится.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X, Search, MapPin, RotateCcw, Loader2, Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/navigation/useVoiceInput';
import { resolveVoiceAddress, learnCorrection, buildStreetIndex, normalizeVoiceText } from '@/lib/navigation/voiceAddressResolver';
import type { SearchResult } from '@/lib/navigation/offlineSearch';
import { suggestAddress } from '@/lib/navigation/dadata';
import type { SavedPlace } from '@/types/navigation';
import type { FiasAddress } from '@/types/fias';

interface VoiceSearchSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectDestination: (place: SavedPlace) => void;
}

export function VoiceSearchSheet({ open, onClose, onSelectDestination }: VoiceSearchSheetProps) {
  const voice = useVoiceInput({ lang: 'ru-RU', continuous: false, interimResults: true });
  const [offlineResults, setOfflineResults] = useState<SearchResult[]>([]);
  const [dadataResults, setDadataResults] = useState<FiasAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [normalizedText, setNormalizedText] = useState('');
  const [usedLearning, setUsedLearning] = useState(false);
  const [queryVariants, setQueryVariants] = useState<string[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Предзагрузка индекса улиц при открытии
  useEffect(() => {
    if (open) buildStreetIndex();
  }, [open]);

  // Автозапуск прослушивания при открытии
  useEffect(() => {
    if (open && voice.isSupported) {
      // Небольшая задержка для плавной анимации
      const t = setTimeout(() => voice.startListening(), 300);
      return () => clearTimeout(t);
    }
    if (!open) {
      voice.reset();
      setOfflineResults([]);
      setDadataResults([]);
      setSearching(false);
      setConfirmed(false);
      setNormalizedText('');
      setUsedLearning(false);
      setQueryVariants([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Умный поиск после получения финального текста
  useEffect(() => {
    if (!voice.finalTranscript || voice.finalTranscript.length < 2) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // 1. Умный offline-резолвер с фонетикой, коррекцией, обучением
        const resolved = await resolveVoiceAddress(
          voice.finalTranscript,
          voice.alternatives,
        );
        setOfflineResults(resolved.results);
        setNormalizedText(resolved.normalizedText);
        setUsedLearning(resolved.usedLearning);
        setQueryVariants(resolved.queryVariants);

        // 2. Онлайн поиск по НЕСКОЛЬКИМ вариантам запроса (DaData + Nominatim)
        // Берём до 3 лучших вариантов и ищем параллельно
        const bestVariants = resolved.queryVariants.slice(0, 3);
        if (bestVariants.length === 0) bestVariants.push(voice.finalTranscript);

        try {
          const allOnline = await Promise.all(
            bestVariants.map(q => suggestAddress(q, 5).catch(() => [] as FiasAddress[]))
          );

          // Объединяем без дублей
          const merged: FiasAddress[] = [];
          const seen = new Set<string>();
          for (const batch of allOnline) {
            for (const addr of batch) {
              const key = addr.geoLat && addr.geoLon
                ? `${addr.geoLat.toFixed(5)},${addr.geoLon.toFixed(5)}`
                : addr.value;
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push(addr);
            }
          }
          setDadataResults(merged.slice(0, 8));
        } catch {
          setDadataResults([]);
        }
      } catch {
        setOfflineResults([]);
        setDadataResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [voice.finalTranscript, voice.alternatives]);

  const handleSelectAddress = useCallback((addr: FiasAddress) => {
    if (!addr.geoLat || !addr.geoLon) return;

    setConfirmed(true);

    // Обучение: запоминаем что пользователь сказал и что выбрал
    if (voice.finalTranscript && addr.value) {
      learnCorrection(voice.finalTranscript, addr.value);
    }

    const place: SavedPlace = {
      id: addr.fiasId || `voice-${Date.now()}`,
      name: addr.value,
      address: addr.unrestrictedValue || addr.value,
      coordinates: { lat: addr.geoLat, lng: addr.geoLon },
      icon: 'recent',
      fiasId: addr.fiasId ?? undefined,
      kladrId: addr.kladrId ?? undefined,
    };

    setTimeout(() => {
      onSelectDestination(place);
      onClose();
    }, 500);
  }, [onSelectDestination, onClose, voice.finalTranscript]);

  /** Выбор offline-результата */
  const handleSelectOffline = useCallback((result: SearchResult) => {
    setConfirmed(true);

    // Обучение
    if (voice.finalTranscript && result.display) {
      learnCorrection(voice.finalTranscript, result.display);
    }

    const place: SavedPlace = {
      id: `offline-${result.id}`,
      name: result.name,
      address: result.display,
      coordinates: { lat: result.position.lat, lng: result.position.lng },
      icon: 'recent',
    };

    setTimeout(() => {
      onSelectDestination(place);
      onClose();
    }, 500);
  }, [onSelectDestination, onClose, voice.finalTranscript]);

  const handleRetry = useCallback(() => {
    voice.reset();
    setOfflineResults([]);
    setDadataResults([]);
    setSearching(false);
    setConfirmed(false);
    setNormalizedText('');
    setUsedLearning(false);
    setQueryVariants([]);
    // Перезапуск
    setTimeout(() => voice.startListening(), 200);
  }, [voice]);

  if (!open) return null;

  const isListening = voice.state === 'listening';
  const isProcessing = voice.state === 'processing';
  const hasError = voice.state === 'error';
  const hasResults = offlineResults.length > 0 || dadataResults.length > 0;
  const showTranscript = voice.transcript || voice.interimTranscript;
  const wasNormalized = normalizedText && normalizedText !== voice.finalTranscript?.toLowerCase().trim();

  return (
    <div className="fixed inset-0 z-[960] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-white font-semibold text-lg">Голосовой поиск</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Визуализация */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Анимированный индикатор микрофона */}
          <div className="relative mb-8">
            {/* Пульсирующие кольца при прослушивании */}
            {isListening && (
              <>
                <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute -inset-4 rounded-full bg-blue-500/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
                <div className="absolute -inset-8 rounded-full bg-blue-500/5 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.6s' }} />
              </>
            )}

            <button
              onClick={isListening ? voice.stopListening : voice.startListening}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center',
                'transition-all duration-300',
                isListening
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/40 scale-110'
                  : hasError
                    ? 'bg-red-500/20 border-2 border-red-500/50'
                    : 'bg-white/10 border-2 border-white/20 hover:bg-white/20',
              )}
            >
              {isListening ? (
                <Mic className="w-10 h-10 text-white animate-pulse" />
              ) : isProcessing ? (
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              ) : hasError ? (
                <MicOff className="w-10 h-10 text-red-400" />
              ) : (
                <Mic className="w-10 h-10 text-gray-400" />
              )}
            </button>
          </div>

          {/* Статус */}
          <p className={cn(
            'text-sm mb-4 transition-colors',
            isListening ? 'text-blue-400' : hasError ? 'text-red-400' : 'text-gray-400',
          )}>
            {isListening
              ? 'Слушаю... Назовите адрес'
              : isProcessing
                ? 'Обрабатываю...'
                : hasError
                  ? voice.error
                  : confirmed
                    ? 'Маршрут строится...'
                    : 'Нажмите на микрофон и назовите адрес'}
          </p>

          {/* Распознанный текст */}
          {showTranscript && (
            <div className={cn(
              'w-full max-w-md px-5 py-4 rounded-2xl mb-4',
              'bg-white/5 border border-white/10',
              'backdrop-blur-sm',
            )}>
              <p className="text-white text-center text-lg font-medium leading-relaxed">
                {voice.finalTranscript}
                {voice.interimTranscript && (
                  <span className="text-gray-400 italic"> {voice.interimTranscript}</span>
                )}
              </p>

              {/* Показываем нормализованный текст, если он отличается */}
              {wasNormalized && (
                <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-white/5">
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-purple-400 text-xs">Понял как: </span>
                  <span className="text-purple-300 text-xs font-medium">{normalizedText}</span>
                </div>
              )}

              {/* Индикатор обучения */}
              {usedLearning && (
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400/70 text-[10px]">Использованы прошлые коррекции</span>
                </div>
              )}
            </div>
          )}

          {/* Альтернативные распознавания */}
          {voice.alternatives.length > 0 && !searching && !hasResults && (
            <div className="w-full max-w-md mb-4">
              <p className="text-[10px] text-gray-600 text-center mb-1">Также слышу:</p>
              <div className="flex flex-wrap justify-center gap-1">
                {voice.alternatives.slice(0, 3).map((alt, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 text-gray-500 text-[10px]">
                    {alt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Индикатор поиска */}
          {searching && (
            <div className="flex items-center gap-2 mb-4">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm text-gray-400">Анализирую адрес...</span>
            </div>
          )}

          {/* Результаты */}
          {hasResults && !confirmed && (
            <div className="w-full max-w-md space-y-1 mb-6 max-h-[40vh] overflow-y-auto">
              {/* Offline результаты (умный fuzzy) */}
              {offlineResults.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
                    <Brain className="w-3 h-3" />
                    Найдено в базе
                  </p>
                  {offlineResults.slice(0, 8).map((result, i) => (
                    <button
                      key={`offline-${result.id}-${i}`}
                      onClick={() => handleSelectOffline(result)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 rounded-xl',
                        'bg-white/5 border border-white/10',
                        'hover:bg-white/10 transition-colors',
                        'text-left',
                      )}
                    >
                      <MapPin className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{result.display}</p>
                        {result.distance != null && (
                          <p className="text-gray-600 text-[10px] mt-0.5">
                            {result.distance < 1 ? `${Math.round(result.distance * 1000)} м` : `${result.distance.toFixed(1)} км`}
                          </p>
                        )}
                      </div>
                      {/* Показываем confidence */}
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                        result.score > 2 ? 'bg-green-500/20 text-green-400' :
                          result.score > 1 ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-500',
                      )}>
                        {Math.min(Math.round(result.score * 33), 99)}%
                      </span>
                    </button>
                  ))}
                </>
              )}

              {/* DaData результаты */}
              {dadataResults.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 uppercase tracking-wider px-1 mb-2 mt-3 flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    Онлайн результаты
                  </p>
                  {dadataResults.map((addr, i) => (
                    <button
                      key={addr.fiasId || `dadata-${i}`}
                      onClick={() => handleSelectAddress(addr)}
                      disabled={!addr.geoLat || !addr.geoLon}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 rounded-xl',
                        'bg-white/5 border border-white/10',
                        'hover:bg-white/10 transition-colors',
                        'text-left',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      <MapPin className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{addr.value}</p>
                        {addr.unrestrictedValue && addr.unrestrictedValue !== addr.value && (
                          <p className="text-gray-500 text-xs truncate mt-0.5">{addr.unrestrictedValue}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Подтверждение */}
          {confirmed && (
            <div className="flex items-center gap-2 text-green-400">
              <Search className="w-5 h-5" />
              <span className="text-sm font-medium">Строим маршрут...</span>
            </div>
          )}

          {/* Нет результатов */}
          {voice.finalTranscript && !searching && !hasResults && !confirmed && voice.state === 'idle' && (
            <div className="text-center">
              <p className="text-gray-500 text-sm">
                Адрес не найден. Попробуйте сказать точнее.
              </p>
              {queryVariants.length > 1 && (
                <p className="text-gray-600 text-[10px] mt-2">
                  Проверено {queryVariants.length} вариантов запроса
                </p>
              )}
            </div>
          )}
        </div>

        {/* Нижняя панель */}
        <div className="px-4 pb-6 pb-safe flex gap-3">
          {/* Повторить */}
          <button
            onClick={handleRetry}
            className={cn(
              'flex-1 h-12 rounded-xl',
              'bg-white/10 border border-white/10',
              'flex items-center justify-center gap-2',
              'text-white font-medium text-sm',
              'transition-all active:scale-[0.98]',
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Повторить
          </button>

          {/* Не поддерживается */}
          {!voice.isSupported && (
            <div className="flex-1 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <span className="text-red-400 text-xs text-center px-2">
                Голосовой ввод не поддерживается в этом браузере
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
