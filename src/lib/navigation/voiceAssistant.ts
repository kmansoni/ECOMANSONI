/**
 * voiceAssistant.ts — Enhanced human-like voice assistant for navigation.
 * Uses Web Speech API with voice selection, human-like intonation,
 * and contextual speech patterns.
 */
import { useNavigatorSettings, VOICE_OPTIONS, type SoundMode, type VoiceId } from '@/stores/navigatorSettingsStore';

let _voices: SpeechSynthesisVoice[] = [];
let _voicesLoaded = false;

function loadVoices(): SpeechSynthesisVoice[] {
  if (!window.speechSynthesis) return [];
  if (_voicesLoaded && _voices.length > 0) return _voices;
  _voices = window.speechSynthesis.getVoices();
  if (_voices.length > 0) _voicesLoaded = true;
  return _voices;
}

// Attempt to load voices (they may load asynchronously)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    _voices = window.speechSynthesis.getVoices();
    _voicesLoaded = true;
  };
  loadVoices();
}

function findBestVoice(voiceId: VoiceId): SpeechSynthesisVoice | null {
  const voices = loadVoices();
  if (voices.length === 0) return null;

  // Пытаемся найти русский голос
  const ruVoices = voices.filter(v => v.lang.startsWith('ru'));
  
  if (voiceId === 'alice' || voiceId === 'elena' || voiceId === 'natasha') {
    // Женские голоса
    const female = ruVoices.find(v => 
      v.name.toLowerCase().includes('female') || 
      v.name.toLowerCase().includes('женск') ||
      v.name.toLowerCase().includes('anna') ||
      v.name.toLowerCase().includes('milena') ||
      v.name.toLowerCase().includes('irina')
    );
    if (female) return female;
  }
  
  if (voiceId === 'dmitry' || voiceId === 'maxim') {
    // Мужские голоса
    const male = ruVoices.find(v => 
      v.name.toLowerCase().includes('male') || 
      v.name.toLowerCase().includes('мужск') ||
      v.name.toLowerCase().includes('pavel') ||
      v.name.toLowerCase().includes('dmitry')
    );
    if (male) return male;
  }

  // Fallback-цепочка: любой русский → голос по умолчанию → первый доступный
  if (ruVoices.length > 0) return ruVoices[0];
  const defaultVoice = voices.find(v => v.default);
  if (defaultVoice) return defaultVoice;
  return voices[0] ?? null;
}

// ─── Human-like filler patterns ─────────────────────────────────────────────
const TURN_FILLERS = ['', 'Внимание, ', 'Пожалуйста, ', ''];
const CAMERA_FILLERS = ['Осторожно, ', 'Внимание, ', 'Впереди ', ''];
const ARRIVAL_PHRASES = [
  'Вы прибыли к месту назначения.',
  'Вы на месте! Приятного времяпровождения.',
  'Прибытие. Вы достигли цели маршрута.',
  'Вы на месте.',
];
const REROUTE_PHRASES = [
  'Пересчитываю маршрут.',
  'Перестраиваю маршрут, подождите.',
  'Маршрут пересчитан.',
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Event types for sound mode filtering ───────────────────────────────────
export type VoiceEventType = 'turn' | 'camera' | 'police' | 'sign' | 'speedbump' | 'arrival' | 'reroute' | 'speed_warning' | 'info';

function shouldSpeak(eventType: VoiceEventType, soundMode: SoundMode): boolean {
  if (soundMode === 'mute') return false;
  if (soundMode === 'all') return true;

  // speed_warning is SAFETY-CRITICAL — always audible in non-mute modes
  if (eventType === 'speed_warning') return true;

  switch (soundMode) {
    case 'cameras': return eventType === 'camera';
    case 'turns': return eventType === 'turn' || eventType === 'arrival' || eventType === 'reroute';
    case 'police': return eventType === 'police';
    case 'signs': return eventType === 'sign' || eventType === 'speedbump';
    default: return false;
  }
}

// ─── Main speak function ────────────────────────────────────────────────────
export function speakNavigation(text: string, eventType: VoiceEventType = 'info'): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('[voiceAssistant] speechSynthesis недоступен');
    return;
  }

  const state = useNavigatorSettings.getState();
  if (!state.voiceEnabled) return;
  if (!shouldSpeak(eventType, state.soundMode)) return;

  const voiceOption = VOICE_OPTIONS.find(v => v.id === state.selectedVoice) || VOICE_OPTIONS[0];
  const synth = window.speechSynthesis;
  
  // Отменяем предыдущие фразы для быстрого отклика
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voiceOption.lang;
  utterance.rate = voiceOption.rate;
  utterance.pitch = voiceOption.pitch;
  utterance.volume = state.volume / 100;

  const voice = findBestVoice(state.selectedVoice);
  if (voice) {
    utterance.voice = voice;
  }
  // Если голос не найден — браузер использует голос по умолчанию для utterance.lang

  utterance.onerror = (e) => {
    console.warn('[voiceAssistant] Ошибка озвучки:', e.error);
  };

  synth.speak(utterance);
}

// ─── Contextual human-like speech helpers ───────────────────────────────────

export function speakTurn(instruction: string, distanceMeters: number): void {
  const filler = randomPick(TURN_FILLERS);
  let distText = '';
  
  if (distanceMeters > 900) {
    distText = `через ${Math.round(distanceMeters / 1000)} километр${pluralKm(Math.round(distanceMeters / 1000))}`;
  } else if (distanceMeters > 90) {
    distText = `через ${Math.round(distanceMeters / 100) * 100} метров`;
  } else {
    distText = 'сейчас';
  }

  const text = distanceMeters > 90
    ? `${filler}${distText}, ${instruction.toLowerCase()}.`
    : `${filler}${instruction}.`;

  speakNavigation(text, 'turn');
}

export function speakCamera(speedLimit: number, distanceMeters: number): void {
  const filler = randomPick(CAMERA_FILLERS);
  const dist = distanceMeters > 500
    ? `через ${Math.round(distanceMeters / 100) * 100} метров`
    : `через ${Math.round(distanceMeters / 50) * 50} метров`;
  
  speakNavigation(
    `${filler}камера контроля скорости ${dist}. Ограничение ${speedLimit} километров в час.`,
    'camera'
  );
}

export function speakSpeedWarning(currentSpeed: number, speedLimit: number): void {
  speakNavigation(
    `Вы превышаете скорость. Ограничение ${speedLimit} километров в час.`,
    'speed_warning'
  );
}

export function speakSpeedBump(distanceMeters: number): void {
  const dist = Math.round(distanceMeters / 50) * 50;
  speakNavigation(`Впереди лежачий полицейский через ${dist} метров.`, 'speedbump');
}

export function speakTrafficLight(): void {
  speakNavigation('Впереди светофор.', 'sign');
}

export function speakPolicePost(distanceMeters: number): void {
  const dist = Math.round(distanceMeters / 100) * 100;
  speakNavigation(`Впереди пост ДПС через ${dist} метров.`, 'police');
}

export function speakArrival(): void {
  speakNavigation(randomPick(ARRIVAL_PHRASES), 'arrival');
}

export function speakReroute(): void {
  speakNavigation(randomPick(REROUTE_PHRASES), 'reroute');
}

export function speakRoadSign(signType: string): void {
  const signs: Record<string, string> = {
    'stop': 'Впереди знак СТОП.',
    'give_way': 'Уступите дорогу.',
    'speed_limit': 'Ограничение скорости.',
    'no_entry': 'Въезд запрещён.',
    'no_overtaking': 'Обгон запрещён.',
    'pedestrian_crossing': 'Впереди пешеходный переход.',
    'school': 'Внимание, впереди школа.',
    'children': 'Осторожно, дети.',
    'road_works': 'Впереди дорожные работы.',
    'slippery_road': 'Осторожно, скользкая дорога.',
  };
  
  speakNavigation(signs[signType] || `Дорожный знак: ${signType}.`, 'sign');
}

// ─── Available voices for settings UI ───────────────────────────────────────
export function getAvailableVoices(): { name: string; lang: string }[] {
  return loadVoices()
    .filter(v => v.lang.startsWith('ru') || v.lang.startsWith('en'))
    .map(v => ({ name: v.name, lang: v.lang }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function pluralKm(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return '';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'а';
  return 'ов';
}
