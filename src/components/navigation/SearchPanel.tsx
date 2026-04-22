import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, Search, Home, Briefcase, Star, Clock, MapPin, X, Plus, Store, Mic, ChevronDown, ChevronUp, History, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedPlace } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';
import type { FiasAddress } from '@/types/fias';
import { getPoiCategoryLabel, POI_CATEGORY_ICONS, type POICategory } from '@/types/fias';
import { suggestAddress } from '@/lib/navigation/dadata';
import { searchPOIs, type POIResult } from '@/lib/navigation/places';
import { getTripHistory, type TripRecord } from '@/lib/navigation/tripHistory';
import { buildStreetIndex, learnCorrection, mapOfflineSearchResultToFiasAddress, rememberLearnedAddress, resolveVoiceAddress } from '@/lib/navigation/voiceAddressResolver';
import { recordVoiceSearchLearningEvent, recordVoiceSelectionFeedback } from '@/lib/navigation/voiceLearningSync';
import { logger } from '@/lib/logger';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import type { UseVoiceInputReturn } from '@/hooks/navigation/useVoiceInput';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { formatNavigationDistance, formatNavigationTripDate, navText } from '@/lib/navigation/navigationUi';

type SearchTab = 'address' | 'poi';

type VoiceSearchIssueKind =
  | 'resolver_failed'
  | 'online_fallback_failed'
  | 'online_fallback_disabled'
  | 'offline_only_results'
  | 'no_matches';

type VoiceSearchIssueTone = 'info' | 'warning' | 'error';

interface VoiceSearchIssue {
  kind: VoiceSearchIssueKind;
  tone: VoiceSearchIssueTone;
  message: string;
  diagnosticCode: string;
}

function getVoiceSearchErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout') || normalized.includes('abort')) return 'timeout';
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed')) return 'network';
  if (/(401|403|404|408|409|422|429|500|502|503|504)/.test(normalized)) return 'http';
  return 'unexpected';
}

interface SearchPanelProps {
  favorites: SavedPlace[];
  recents: SavedPlace[];
  currentPosition: LatLng | null;
  voice: UseVoiceInputReturn;
  initialVoiceQuery?: {
    text: string;
    alternatives: string[];
  } | null;
  onInitialVoiceQueryHandled?: () => void;
  autoStartVoice?: boolean;
  onVoiceAutoStartHandled?: () => void;
  onSelectDestination: (place: SavedPlace) => void;
  onClose: () => void;
  onAddPlace?: () => void;
}

const PLACE_ICONS: Record<string, React.ElementType> = {
  home: Home,
  work: Briefcase,
  star: Star,
  recent: Clock,
};

export function SearchPanel({
  favorites,
  recents,
  currentPosition,
  voice,
  initialVoiceQuery = null,
  onInitialVoiceQueryHandled,
  autoStartVoice = false,
  onVoiceAutoStartHandled,
  onSelectDestination,
  onClose,
  onAddPlace,
}: SearchPanelProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('address');
  const [addressResults, setAddressResults] = useState<FiasAddress[]>([]);
  const [poiResults, setPOIResults] = useState<POIResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [showTripHistory, setShowTripHistory] = useState(false);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [tripHistoryLoading, setTripHistoryLoading] = useState(false);
  const [voiceNormalizedText, setVoiceNormalizedText] = useState('');
  const [bestVoiceMatch, setBestVoiceMatch] = useState<FiasAddress | null>(null);
  const [voiceSearchIssue, setVoiceSearchIssue] = useState<VoiceSearchIssue | null>(null);
  const voiceAllowOnlineFallback = useNavigatorSettings((state) => state.voiceAllowOnlineFallback);
  const voiceLearningEnabled = useNavigatorSettings((state) => state.voiceLearningEnabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastVoiceQueryRef = useRef<string | null>(null);
  const {
    isSupported: isVoiceSupported,
    state: voiceState,
    interimTranscript,
    finalTranscript,
    alternatives,
    startListening,
    stopListening,
    reset: resetVoice,
  } = voice;

  const tabs: { id: SearchTab; label: string; icon: React.ElementType }[] = [
    { id: 'address', label: navText('Адреса', 'Addresses', languageCode), icon: MapPin },
    { id: 'poi', label: navText('Места', 'Places', languageCode), icon: Store },
  ];

  const quickPoiCategories: Array<{ id: POICategory; label: string; query: string }> = [
    { id: 'restaurant', label: navText('Рестораны', 'Restaurants', languageCode), query: navText('ресторан', 'restaurant', languageCode) },
    { id: 'cafe', label: navText('Кафе', 'Cafes', languageCode), query: navText('кафе', 'cafe', languageCode) },
    { id: 'shop', label: navText('Магазины', 'Shops', languageCode), query: navText('магазин', 'shop', languageCode) },
    { id: 'fuel', label: navText('АЗС', 'Fuel', languageCode), query: navText('заправка азс', 'fuel gas station', languageCode) },
    { id: 'car_wash', label: navText('Мойки', 'Car Wash', languageCode), query: navText('автомойка мойка', 'car wash', languageCode) },
    { id: 'car_wash', label: navText('Самомойки', 'Self Wash', languageCode), query: navText('самомойка мойка самообслуживания', 'self service car wash', languageCode) },
    { id: 'car_service', label: navText('Автосервисы', 'Auto Service', languageCode), query: navText('автосервис сто', 'auto service repair', languageCode) },
    { id: 'car_service', label: navText('Шиномонтаж', 'Tire Service', languageCode), query: navText('шиномонтаж', 'tire service', languageCode) },
    { id: 'parking', label: navText('Парковки', 'Parking', languageCode), query: navText('парковка', 'parking', languageCode) },
    { id: 'pharmacy', label: navText('Аптеки', 'Pharmacies', languageCode), query: navText('аптека', 'pharmacy', languageCode) },
    { id: 'hospital', label: navText('Больницы', 'Hospitals', languageCode), query: navText('больница клиника', 'hospital clinic', languageCode) },
    { id: 'hotel', label: navText('Отели', 'Hotels', languageCode), query: navText('отель гостиница', 'hotel', languageCode) },
    { id: 'bank', label: navText('Банки', 'Banks', languageCode), query: navText('банк', 'bank', languageCode) },
    { id: 'atm', label: navText('Банкоматы', 'ATMs', languageCode), query: navText('банкомат atm', 'atm', languageCode) },
    { id: 'beauty', label: navText('Красота', 'Beauty', languageCode), query: navText('салон красоты барбершоп', 'beauty salon barber', languageCode) },
    { id: 'gym', label: navText('Фитнес', 'Fitness', languageCode), query: navText('фитнес спортзал gym', 'gym fitness', languageCode) },
    { id: 'education', label: navText('Образование', 'Education', languageCode), query: navText('школа университет колледж', 'school university college', languageCode) },
    { id: 'government', label: navText('Госуслуги', 'Government', languageCode), query: navText('мфц гибдд госуслуги', 'government services', languageCode) },
  ];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    inputRef.current?.focus();
    void buildStreetIndex();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!autoStartVoice || !isVoiceSupported || voiceState !== 'idle') return;

    startListening();
    onVoiceAutoStartHandled?.();
  }, [autoStartVoice, isVoiceSupported, onVoiceAutoStartHandled, startListening, voiceState]);

  useEffect(() => {
    if (!showTripHistory) return;

    let cancelled = false;

    const loadTripHistory = async () => {
      setTripHistoryLoading(true);
      try {
        const trips = await getTripHistory(8);
        if (!cancelled) {
          setTripHistory(trips);
        }
      } finally {
        if (!cancelled) {
          setTripHistoryLoading(false);
        }
      }
    };

    void loadTripHistory();

    return () => {
      cancelled = true;
    };
  }, [showTripHistory]);

  const createVoiceSearchIssue = useCallback((kind: VoiceSearchIssueKind, diagnosticCode: string): VoiceSearchIssue => {
    switch (kind) {
      case 'resolver_failed':
        return {
          kind,
          tone: 'error',
          diagnosticCode,
          message: navText(
            'Не удалось разобрать голосовой адрес. Попробуйте повторить запрос или ввести адрес вручную.',
            'Could not parse the voice address. Try again or enter the address manually.',
            languageCode,
          ),
        };
      case 'online_fallback_failed':
        return {
          kind,
          tone: 'warning',
          diagnosticCode,
          message: navText(
            'Онлайн-уточнение адреса недоступно, показываю локальные совпадения.',
            'Online address refinement is unavailable, showing local matches only.',
            languageCode,
          ),
        };
      case 'online_fallback_disabled':
        return {
          kind,
          tone: 'info',
          diagnosticCode,
          message: navText(
            'Онлайн fallback для голосового адреса отключён, ищу только по локальным данным.',
            'Online fallback for voice address search is disabled, using local data only.',
            languageCode,
          ),
        };
      case 'offline_only_results':
        return {
          kind,
          tone: 'info',
          diagnosticCode,
          message: navText(
            'Найдены только локальные совпадения. Уточните номер дома или включите онлайн fallback для точного адреса.',
            'Only local matches were found. Add a house number or enable online fallback for a precise address.',
            languageCode,
          ),
        };
      case 'no_matches':
      default:
        return {
          kind: 'no_matches',
          tone: 'info',
          diagnosticCode,
          message: navText(
            'Голосовой адрес распознан, но совпадений не найдено. Попробуйте другой вариант формулировки.',
            'The voice address was recognized, but no matches were found. Try a different wording.',
            languageCode,
          ),
        };
    }
  }, [languageCode]);

  const mergeVoiceAddressResults = useCallback((online: FiasAddress[], offline: FiasAddress[]) => {
    const merged: FiasAddress[] = [];
    const seen = new Set<string>();

    for (const addr of [...online, ...offline]) {
      const key = addr.geoLat != null && addr.geoLon != null
        ? `${addr.geoLat.toFixed(5)},${addr.geoLon.toFixed(5)}`
        : addr.unrestrictedValue || addr.value;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(addr);
    }

    return merged;
  }, []);

  const rankVoiceAddressResults = useCallback((results: FiasAddress[], spokenText: string, normalizedText: string) => {
    const tokens = normalizedText
      .toLowerCase()
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const houseToken = tokens.find((token) => /^\d+[а-яa-z0-9/-]*$/i.test(token)) ?? null;
    const corpusMatch = normalizedText.match(/(?:к\.?|корпус)\s*(\d+[а-яa-z0-9/-]*)/i);
    const corpusToken = corpusMatch?.[1] ?? null;
    const streetTokens = tokens.filter((token) => !/^\d/.test(token) && !['ул', 'ул.', 'улица', 'д', 'д.', 'дом', 'к', 'к.', 'корпус', 'стр', 'стр.', 'строение', 'москва'].includes(token));

    const scoreAddress = (addr: FiasAddress, index: number) => {
      const haystack = `${addr.value} ${addr.unrestrictedValue ?? ''}`.toLowerCase();
      let score = Math.max(0, 40 - index * 2);

      for (const token of streetTokens) {
        if (haystack.includes(token)) score += 18;
      }

      if (houseToken && (addr.house === houseToken || haystack.includes(` ${houseToken}`))) {
        score += 28;
      }

      if (corpusToken && haystack.includes(corpusToken)) {
        score += 20;
      }

      if (spokenText && haystack.includes(spokenText.toLowerCase())) {
        score += 12;
      }

      if (addr.country === 'Offline') {
        score += 6;
      }

      return score;
    };

    return [...results].sort((left, right) => scoreAddress(right, results.indexOf(right)) - scoreAddress(left, results.indexOf(left)));
  }, []);

  const voiceTranscriptChoices = [
    finalTranscript.trim(),
    ...alternatives.map((item) => item.trim()),
    interimTranscript.trim(),
  ].filter((value, index, items) => value.length >= 2 && items.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index).slice(0, 3);

  const performVoiceAddressSearch = useCallback(async (spokenText: string, alternatives: string[]) => {
    const trimmed = spokenText.trim();
    if (trimmed.length < 2) return;

    setTab('address');
    setShowTripHistory(false);
    setLoading(true);
    setVoiceSearchIssue(null);

    try {
      let resolved;
      try {
        resolved = await resolveVoiceAddress(trimmed, alternatives, currentPosition ?? undefined);
      } catch (error) {
        const diagnosticCode = `voice_resolver:${getVoiceSearchErrorCode(error)}`;
        logger.warn('[SearchPanel] voice address resolver failed', { diagnosticCode, error });
        setQuery(trimmed);
        setVoiceNormalizedText('');
        setBestVoiceMatch(null);
        setPOIResults([]);
        setVoiceSearchIssue(createVoiceSearchIssue('resolver_failed', diagnosticCode));
        return;
      }

      const normalized = resolved.normalizedText || trimmed;

      setQuery(normalized);
      setVoiceNormalizedText(normalized !== trimmed.toLowerCase().trim() ? normalized : '');
      lastVoiceQueryRef.current = trimmed;

      const offlineResults = resolved.results
        .filter((result) => result.type === 'address' || result.type === 'city')
        .map(mapOfflineSearchResultToFiasAddress);

      const looksLikeConcreteAddress = /\d|\b(ул\.?|улица|street|st\.?|ave\.?|avenue|road|rd\.?|дом|д\.?|house|building|корпус|к\.?|стр\.?)\b/i.test(normalized);
      const hasOfflineAddress = offlineResults.some((result) => result.value.length > 0 && /\d/.test(result.value));
      const shouldUseOnlineFallback = voiceAllowOnlineFallback && (offlineResults.length === 0 || (looksLikeConcreteAddress && !hasOfflineAddress));

      let fallbackResults: FiasAddress[] = [];
      let issue: VoiceSearchIssue | null = null;

      if (shouldUseOnlineFallback) {
        try {
          fallbackResults = await suggestAddress(normalized, 8, currentPosition ?? undefined, { allowOnline: true });
        } catch (error) {
          const diagnosticCode = `voice_online_fallback:${getVoiceSearchErrorCode(error)}`;
          logger.warn('[SearchPanel] voice address online fallback failed', { diagnosticCode, error, normalized });
          issue = createVoiceSearchIssue('online_fallback_failed', diagnosticCode);
        }
      } else if (looksLikeConcreteAddress && !hasOfflineAddress) {
        issue = createVoiceSearchIssue(
          voiceAllowOnlineFallback ? 'offline_only_results' : 'online_fallback_disabled',
          voiceAllowOnlineFallback ? 'voice_offline_only:street_without_house_match' : 'voice_online_fallback:disabled',
        );
      }

      const rankedResults = rankVoiceAddressResults(
        mergeVoiceAddressResults(fallbackResults, offlineResults),
        trimmed,
        normalized,
      ).slice(0, 10);

      if (rankedResults.length === 0) {
        issue = issue ?? createVoiceSearchIssue('no_matches', 'voice_search:no_matches');
      } else if (issue?.kind === 'online_fallback_failed' && offlineResults.length === 0) {
        issue = createVoiceSearchIssue('no_matches', `${issue.diagnosticCode}:empty_local_and_online`);
      }

      if (!issue && rankedResults.length > 0 && offlineResults.length > 0 && fallbackResults.length === 0 && looksLikeConcreteAddress && !hasOfflineAddress) {
        issue = createVoiceSearchIssue('offline_only_results', 'voice_offline_only:partial_address_match');
      }

      recordVoiceSearchLearningEvent({
        transcript: trimmed,
        resolved,
        chosenAddress: rankedResults[0] ?? null,
      });

      setAddressResults(rankedResults);
      setBestVoiceMatch(rankedResults[0] ?? null);
      setPOIResults([]);
      setVoiceSearchIssue(issue);
    } catch (error) {
      const diagnosticCode = `voice_search:${getVoiceSearchErrorCode(error)}`;
      logger.warn('[SearchPanel] unexpected voice search failure', { diagnosticCode, error });
      setBestVoiceMatch(null);
      setVoiceSearchIssue(createVoiceSearchIssue('resolver_failed', diagnosticCode));
    } finally {
      setLoading(false);
    }
  }, [createVoiceSearchIssue, currentPosition, mergeVoiceAddressResults, rankVoiceAddressResults, voiceAllowOnlineFallback]);

  useEffect(() => {
    if (!initialVoiceQuery?.text || voiceState !== 'idle') return;

    void performVoiceAddressSearch(initialVoiceQuery.text, initialVoiceQuery.alternatives);
    onInitialVoiceQueryHandled?.();
  }, [initialVoiceQuery, onInitialVoiceQueryHandled, performVoiceAddressSearch, voiceState]);

  const performSearch = useCallback(async (text: string, currentTab: SearchTab) => {
    if (text.length < 2) {
      setAddressResults([]);
      setPOIResults([]);
      setVoiceSearchIssue(null);
      return;
    }
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    setLoading(true);
    try {
      if (currentTab === 'address') {
        const results = await suggestAddress(text, 8, currentPosition ?? undefined, { allowOnline: voiceAllowOnlineFallback });
        setAddressResults(results);
      } else {
        const results = await searchPOIs(text, 20, currentPosition ?? undefined);
        setPOIResults(results);
      }
    } catch (error) {
      logger.warn('[SearchPanel] search failed', { error, tab: currentTab, query: text });
    } finally {
      setLoading(false);
    }
  }, [currentPosition, voiceAllowOnlineFallback]);

  // Когда голосовой ввод завершается — вставить текст в поле
  useEffect(() => {
    if (finalTranscript && voiceState === 'idle') {
      const nextQuery = finalTranscript.trim();
      if (!nextQuery) return;
      if (tab === 'address') {
        void performVoiceAddressSearch(nextQuery, alternatives);
      } else {
        setQuery(nextQuery);
        setVoiceNormalizedText('');
        performSearch(nextQuery, tab);
      }
    }
  }, [alternatives, finalTranscript, performVoiceAddressSearch, performSearch, tab, voiceState]);

  const handleInput = (value: string) => {
    setQuery(value);
    setVoiceNormalizedText('');
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    lastVoiceQueryRef.current = null;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value, tab), 350);
  };

  const handleTabChange = (newTab: SearchTab) => {
    setTab(newTab);
    setVoiceNormalizedText('');
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    if (query.length >= 2) {
      performSearch(query, newTab);
    }
  };

  const handleQuickCategorySelect = (categoryQuery: string) => {
    setTab('poi');
    setQuery(categoryQuery);
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    void performSearch(categoryQuery, 'poi');
  };

  const handleClose = () => {
    if (isClosing) return;
    resetVoice();
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    setIsClosing(true);
    setIsVisible(false);
    closeTimerRef.current = setTimeout(() => onClose(), 220);
  };

  const handleTranscriptChoice = (choice: string) => {
    if (!choice.trim()) return;
    if (isListening || isVoiceBusy) {
      stopListening();
    }

    if (tab === 'address') {
      void performVoiceAddressSearch(choice, voiceTranscriptChoices.filter((item) => item !== choice));
      return;
    }

    setQuery(choice);
    setVoiceNormalizedText('');
    setBestVoiceMatch(null);
    setVoiceSearchIssue(null);
    void performSearch(choice, tab);
  };

  const handleOpenHistory = () => {
    setQuery('');
    setAddressResults([]);
    setPOIResults([]);
    setTab('address');
    setShowTripHistory((value) => {
      const nextValue = !value;
      if (nextValue) {
        requestAnimationFrame(() => {
          recentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return nextValue;
    });
  };

  const handleSelectTrip = (trip: TripRecord) => {
    onSelectDestination({
      id: `trip-${trip.id}`,
      name: trip.destinationName,
      address: trip.destinationAddress,
      coordinates: {
        lat: trip.destinationLat,
        lng: trip.destinationLon,
      },
      icon: 'recent',
    });
  };

  const formatTripDate = (iso: string) => {
    return formatNavigationTripDate(iso, languageCode);
  };

  const formatTripDistance = (meters: number) => {
    return formatNavigationDistance(meters, languageCode);
  };

  const handleSelectAddress = (addr: FiasAddress) => {
    if (!addr.geoLat || !addr.geoLon) return;
    if (lastVoiceQueryRef.current && addr.value) {
      if (voiceLearningEnabled) {
        learnCorrection(lastVoiceQueryRef.current, addr.value);
        rememberLearnedAddress(lastVoiceQueryRef.current, {
          name: addr.value.split(',')[0] || addr.value,
          display: addr.unrestrictedValue || addr.value,
          coordinates: { lat: addr.geoLat, lng: addr.geoLon },
        });
      }
      recordVoiceSelectionFeedback({
        heardText: lastVoiceQueryRef.current,
        selectedAddress: addr,
      });
      lastVoiceQueryRef.current = null;
    }
    setBestVoiceMatch(null);
    const place: SavedPlace = {
      id: addr.fiasId ?? `addr-${Date.now()}`,
      name: addr.value.split(',')[0],
      address: addr.value,
      coordinates: { lat: addr.geoLat, lng: addr.geoLon },
      icon: 'star',
      fiasId: addr.fiasId ?? undefined,
      kladrId: addr.kladrId ?? undefined,
      postalCode: addr.postalCode ?? undefined,
      fiasLevel: addr.fiasLevel ?? undefined,
    };
    onSelectDestination(place);
  };

  const handleSelectPOI = (poi: POIResult) => {
    const place: SavedPlace = {
      id: poi.id,
      name: poi.name,
      address: poi.address || '',
      coordinates: poi.coordinates,
      icon: 'star',
      category: poi.category,
    };
    onSelectDestination(place);
  };

  const handleSelectFavorite = (place: SavedPlace) => {
    onSelectDestination(place);
  };

  const configuredFavorites = favorites.filter((f) => f.coordinates.lat !== 0);
  const showSuggestions = query.length < 2;
  const visibleCategories = categoriesExpanded ? quickPoiCategories : quickPoiCategories.slice(0, 6);
  const isListening = voiceState === 'listening';
  const isVoiceBusy = voiceState === 'processing';

  return (
    <div
      className={cn(
        'absolute inset-0 z-[950] flex flex-col overflow-hidden',
        'bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_rgba(6,11,20,0.98)_0%,_rgba(2,6,14,0.995)_100%)]',
        'transition-[opacity,transform] duration-300 ease-out',
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.985]'
      )}
      aria-hidden={isClosing}
    >
      <div className="border-b border-white/10 bg-black/10 px-3 pb-3 pt-safe backdrop-blur-2xl">
        <div className="rounded-[30px] border border-white/14 bg-white/[0.055] p-2 shadow-[0_14px_36px_rgba(6,10,16,0.24)]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleClose} className="flex h-11 w-11 items-center justify-center rounded-2xl text-white transition-colors hover:bg-white/6">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="relative flex-1 overflow-hidden rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_rgba(0,0,0,0.14)] backdrop-blur-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-200/70" />
              <input
                ref={inputRef}
                type="text"
                placeholder={tab === 'address' ? navText('Куда едем?', 'Where to?', languageCode) : navText('Найти место', 'Find a place', languageCode)}
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                className="h-11 w-full bg-transparent pl-10 pr-10 text-sm text-white placeholder:text-gray-500 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setAddressResults([]); setPOIResults([]); setVoiceNormalizedText(''); setBestVoiceMatch(null); setVoiceSearchIssue(null); lastVoiceQueryRef.current = null; }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {isVoiceSupported && (
              <button
                type="button"
                onClick={() => isListening || isVoiceBusy ? stopListening() : startListening()}
                className={cn(
                  'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] border transition-all duration-200 active:scale-95',
                  isListening
                    ? 'border-cyan-300/35 bg-cyan-400/18 text-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_10px_24px_rgba(8,145,178,0.22)]'
                    : isVoiceBusy
                      ? 'border-blue-300/25 bg-blue-400/14 text-blue-100'
                      : 'border-white/12 bg-white/[0.055] text-gray-300 hover:bg-white/[0.09] hover:border-white/18'
                )}
                aria-label={navText('Голосовой ввод', 'Voice input', languageCode)}
              >
                {(isListening || isVoiceBusy) && (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-[-6px] rounded-[24px] border',
                        isListening
                          ? 'border-cyan-300/30 animate-ping'
                          : 'border-blue-300/20 animate-pulse'
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-[-12px] rounded-[28px] border opacity-70',
                        isListening
                          ? 'border-cyan-300/20 animate-pulse'
                          : 'border-blue-300/15 animate-pulse'
                      )}
                    />
                  </>
                )}
                <Mic className={cn('w-4 h-4', isListening && 'animate-pulse')} />
              </button>
            )}
          </div>

          {(voiceTranscriptChoices.length > 0 || (tab === 'address' && bestVoiceMatch)) && (
            <div className="mt-3 space-y-2 px-1 pb-1">
              {voiceTranscriptChoices.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {voiceTranscriptChoices.map((choice) => (
                    <button
                      type="button"
                      key={choice}
                      onClick={() => handleTranscriptChoice(choice)}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gray-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'address' && bestVoiceMatch && !loading && (
                <div className="rounded-[22px] border border-emerald-400/18 bg-emerald-400/[0.06] px-3 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/14 text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-200/80">{navText('Лучшее совпадение', 'Best match', languageCode)}</p>
                      <p className="truncate text-sm font-medium text-white">{bestVoiceMatch.value}</p>
                      <p className="truncate text-[11px] text-gray-400">{bestVoiceMatch.unrestrictedValue || bestVoiceMatch.value}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectAddress(bestVoiceMatch)}
                      className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-400/18"
                    >
                      {navText('Подтвердить', 'Confirm', languageCode)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="mt-3 flex gap-2 px-1 pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-xs font-medium transition-all',
                  tab === t.id
                    ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-200 shadow-[0_8px_24px_rgba(34,211,238,0.12)]'
                    : 'border-white/8 bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-gray-200'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        {/* Quick categories */}
        {showSuggestions && (
          <div className="p-3 pb-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCategoriesExpanded((value) => !value)}
                className="flex items-center gap-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
              >
                <span>{navText('Категории', 'Categories', languageCode)}</span>
                {categoriesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleOpenHistory}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition-all',
                  showTripHistory
                    ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100 shadow-[0_8px_24px_rgba(34,211,238,0.10)]'
                    : (tripHistory.length > 0 || recents.length > 0)
                    ? 'border-white/10 bg-white/[0.05] text-gray-200 hover:bg-white/[0.09] hover:border-white/20'
                    : 'border-white/5 bg-white/[0.03] text-gray-500 opacity-60'
                )}
              >
                <History className="h-4 w-4" />
                {navText('История поездок', 'Trip history', languageCode)}
                {showTripHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {showTripHistory && (
              <div ref={recentsRef} className="mb-3 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div className="border-b border-white/8 px-4 py-3">
                  <p className="text-sm font-medium text-white">{navText('История поездок', 'Trip history', languageCode)}</p>
                  <p className="text-[11px] text-gray-500">{navText('Нажмите, чтобы быстро повторить маршрут', 'Tap to quickly repeat the route', languageCode)}</p>
                </div>

                {tripHistoryLoading && (
                  <div className="flex items-center justify-center px-4 py-6">
                    <div className="h-5 w-5 rounded-full border-2 border-cyan-400/60 border-t-transparent animate-spin" />
                  </div>
                )}

                {!tripHistoryLoading && tripHistory.length === 0 && (
                  <div className="px-4 py-5 text-sm text-gray-400">{navText('История поездок пока пуста.', 'Trip history is empty.', languageCode)}</div>
                )}

                {!tripHistoryLoading && tripHistory.length > 0 && (
                  <div className="divide-y divide-white/6">
                    {tripHistory.map((trip) => (
                      <button
                        type="button"
                        key={trip.id}
                        onClick={() => handleSelectTrip(trip)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-300">
                          <History className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{trip.destinationName}</p>
                          <p className="truncate text-[11px] text-gray-500">{trip.destinationAddress || trip.originAddress}</p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500">
                            <span>{formatTripDate(trip.startedAt)}</span>
                            <span>•</span>
                            <span>{formatTripDistance(trip.distanceMeters)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {visibleCategories.map((category) => {
                const icon = POI_CATEGORY_ICONS[category.id] ?? '📍';
                return (
                  <button
                    type="button"
                    key={`${category.id}-${category.label}`}
                    onClick={() => handleQuickCategorySelect(category.query)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-left',
                      'shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all hover:bg-white/[0.08] hover:border-white/15 active:scale-[0.99]'
                    )}
                  >
                    <span className="text-lg shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{category.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{category.query}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Favorites */}
        {showSuggestions && configuredFavorites.length > 0 && (
          <div className="p-3 pt-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">{navText('Избранное', 'Favorites', languageCode)}</p>
            <div className="flex gap-2 flex-wrap">
              {configuredFavorites.map((fav) => {
                const Icon = PLACE_ICONS[fav.icon] ?? Star;
                return (
                  <button
                    type="button"
                    key={fav.id}
                    onClick={() => handleSelectFavorite(fav)}
                    className={cn(
                      'flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.045] px-4 py-2.5',
                      'hover:bg-white/[0.08] transition-colors'
                    )}
                  >
                    <Icon className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white font-medium">{fav.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recents */}
        {showSuggestions && recents.length > 0 && (
          <div ref={recentsRef} className="px-3 pb-4 pt-2 scroll-mt-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{navText('Недавние', 'Recent', languageCode)}</p>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-gray-400">
                {recents.length}
              </span>
            </div>
            {recents.map((place) => (
              <button
                type="button"
                key={place.id}
                onClick={() => handleSelectFavorite(place)}
                className="mb-1 flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-colors hover:border-white/10 hover:bg-white/[0.05]"
              >
                <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="min-w-0 text-left">
                  <p className="text-sm text-white truncate">{place.name}</p>
                  <p className="text-xs text-gray-500 truncate">{place.address}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Add place button */}
        {showSuggestions && onAddPlace && (
          <div className="px-3 pb-4">
            <button
              type="button"
              onClick={onAddPlace}
              className={cn(
                'w-full flex items-center gap-3 rounded-2xl px-4 py-3',
                'bg-green-500/10 border border-green-500/20',
                'hover:bg-green-500/20 transition-colors'
              )}
            >
              <Plus className="w-5 h-5 text-green-400" />
              <div className="text-left">
                <p className="text-sm text-green-400 font-medium">{navText('Добавить место', 'Add place', languageCode)}</p>
                <p className="text-xs text-gray-500">{navText('Магазин, кафе, организация...', 'Shop, cafe, organization...', languageCode)}</p>
              </div>
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && voiceSearchIssue && tab === 'address' && (
          <div className="px-3 pb-2">
            <div
              className={cn(
                'rounded-2xl border px-3 py-2',
                voiceSearchIssue.tone === 'error' && 'border-rose-400/20 bg-rose-400/[0.08] text-rose-100',
                voiceSearchIssue.tone === 'warning' && 'border-amber-400/20 bg-amber-400/[0.08] text-amber-100',
                voiceSearchIssue.tone === 'info' && 'border-sky-400/18 bg-sky-400/[0.06] text-sky-100',
              )}
            >
              <p className="text-xs font-medium">{voiceSearchIssue.message}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">{voiceSearchIssue.diagnosticCode}</p>
            </div>
          </div>
        )}

        {!loading && voiceNormalizedText && tab === 'address' && (
          <div className="px-3 pb-2">
            <div className="rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-100/90">
              {navText('Понял адрес как:', 'Interpreted address as:', languageCode)} <span className="font-medium text-cyan-50">{voiceNormalizedText}</span>
            </div>
          </div>
        )}

        {/* Address results */}
        {!loading && tab === 'address' && addressResults.length > 0 && (
          <div className="px-3 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">
              {navText('Результаты ФИАС', 'Address results', languageCode)}
            </p>
            {addressResults.map((addr, i) => (
              <button
                type="button"
                key={addr.fiasId ?? `addr-${i}`}
                onClick={() => handleSelectAddress(addr)}
                className="w-full flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 hover:border-white/10 hover:bg-white/[0.05] transition-colors"
              >
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0 text-left flex-1">
                  <p className="text-sm text-white truncate">{addr.value}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {addr.postalCode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {addr.postalCode}
                      </span>
                    )}
                    {addr.fiasId && (
                      <span className="text-[10px] text-gray-600 truncate">
                        {navText('ФИАС', 'FIAS', languageCode)}: {addr.fiasId.substring(0, 8)}...
                      </span>
                    )}
                    {addr.region && (
                      <span className="text-[10px] text-gray-500">{addr.region}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* POI results */}
        {!loading && tab === 'poi' && poiResults.length > 0 && (
          <div className="px-3 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">
              {navText('Места', 'Places', languageCode)}
            </p>
            {poiResults.map((poi) => {
              const catIcon = POI_CATEGORY_ICONS[poi.category as keyof typeof POI_CATEGORY_ICONS] ?? '📍';
              const catLabel = getPoiCategoryLabel(poi.category as POICategory, languageCode);
              return (
                <button
                  type="button"
                  key={poi.id}
                  onClick={() => handleSelectPOI(poi)}
                  className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg shrink-0">{catIcon}</span>
                  <div className="min-w-0 text-left flex-1">
                    <p className="text-sm text-white truncate">{poi.name}</p>
                    {poi.address && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{poi.address}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {catLabel}
                      </span>
                      {poi.rating != null && (
                        <span className="text-[10px] text-yellow-400">
                          ★ {poi.rating.toFixed(1)}
                        </span>
                      )}
                      {poi.isVerified && (
                        <span className="text-[10px] text-blue-400">✓</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {!loading && query.length >= 2 &&
          ((tab === 'address' && addressResults.length === 0) ||
           (tab === 'poi' && poiResults.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <MapPin className="w-8 h-8 mb-2" />
            <p className="text-sm">{navText('Ничего не найдено', 'Nothing found', languageCode)}</p>
            {tab === 'poi' && onAddPlace && (
              <button
                type="button"
                onClick={onAddPlace}
                className="mt-3 text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                {navText('+ Добавить новое место', '+ Add a new place', languageCode)}
              </button>
            )}
          </div>
        )}

        {/* Quick suggestions (only address tab, empty query) */}
        {showSuggestions && tab === 'address' && recents.length === 0 && configuredFavorites.length === 0 && (
          <div className="px-3 pt-4">
            <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">{navText('Попробуйте', 'Try these', languageCode)}</p>
            {[
              { name: 'Красная площадь', addr: 'Москва, Красная площадь', lat: 55.7539, lng: 37.6208 },
              { name: 'Шереметьево', addr: 'Аэропорт Шереметьево', lat: 55.9726, lng: 37.4146 },
              { name: 'Москва-Сити', addr: 'Деловой центр', lat: 55.7494, lng: 37.5400 },
              { name: 'ВДНХ', addr: 'Проспект Мира, 119', lat: 55.8267, lng: 37.6375 },
            ].map((s, i) => (
              <button
                type="button"
                key={i}
                onClick={() => onSelectDestination({
                  id: `quick-${i}`,
                  name: s.name,
                  address: s.addr,
                  coordinates: { lat: s.lat, lng: s.lng },
                  icon: 'star',
                })}
                className="w-full flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 hover:border-white/10 hover:bg-white/[0.05] transition-colors"
              >
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="text-left">
                  <p className="text-sm text-white">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.addr}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
