/**
 * navigatorSettingsStore — Хранилище настроек навигатора (Zustand).
 * Сохраняется в localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Режимы звука ───────────────────────────────────────────────────────────
export type SoundMode =
  | 'all'          // все звуки
  | 'cameras'      // только камеры
  | 'turns'        // только повороты
  | 'police'       // только посты
  | 'signs'        // только дорожные знаки
  | 'mute';        // всё выключено

// ─── Выбор голоса ───────────────────────────────────────────────────────────
export type VoiceId = 'default' | 'alice' | 'dmitry' | 'elena' | 'natasha' | 'maxim' | 'custom';

export interface VoiceOption {
  id: VoiceId;
  label: string;
  lang: string;
  rate: number;
  pitch: number;
  description: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'default', label: 'Стандартный', lang: 'ru-RU', rate: 1.05, pitch: 1.0, description: 'Системный голос' },
  { id: 'alice', label: 'Алиса', lang: 'ru-RU', rate: 1.0, pitch: 1.2, description: 'Женский, дружелюбный' },
  { id: 'dmitry', label: 'Дмитрий', lang: 'ru-RU', rate: 0.95, pitch: 0.8, description: 'Мужской, спокойный' },
  { id: 'elena', label: 'Елена', lang: 'ru-RU', rate: 1.1, pitch: 1.1, description: 'Женский, уверенный' },
  { id: 'natasha', label: 'Наташа', lang: 'ru-RU', rate: 1.0, pitch: 1.3, description: 'Женский, мягкий' },
  { id: 'maxim', label: 'Максим', lang: 'ru-RU', rate: 0.9, pitch: 0.7, description: 'Мужской, низкий' },
];

// ─── Метка транспорта ────────────────────────────────────────────────────────
export type VehicleCategory = 'car' | 'suv' | 'sport' | 'truck' | 'motorcycle' | 'bicycle' | 'animal' | 'aircraft' | 'custom';

export interface VehicleMarker {
  id: string;
  category: VehicleCategory;
  name: string;
  brand?: string;
  model?: string;
  emoji: string;
  color: string;
}

export const VEHICLE_MARKERS: VehicleMarker[] = [
  { id: 'navigation-arrow', category: 'custom', name: 'Навигационная стрелка', emoji: '➤', color: '#38BDF8' },
  // --- Легковые ---
  { id: 'sedan-white', category: 'car', name: 'Седан', brand: 'Toyota', model: 'Camry', emoji: '🚗', color: '#ECEFF1' },
  { id: 'sedan-black', category: 'car', name: 'Седан', brand: 'BMW', model: '5 Series', emoji: '🚗', color: '#263238' },
  { id: 'sedan-red', category: 'car', name: 'Седан', brand: 'Audi', model: 'A6', emoji: '🚗', color: '#EF5350' },
  { id: 'sedan-blue', category: 'car', name: 'Седан', brand: 'Mercedes', model: 'E-Class', emoji: '🚗', color: '#42A5F5' },
  { id: 'hatch-yellow', category: 'car', name: 'Хэтчбэк', brand: 'Volkswagen', model: 'Golf', emoji: '🚗', color: '#FFEE58' },
  // --- Внедорожники ---
  { id: 'suv-black', category: 'suv', name: 'Внедорожник', brand: 'Toyota', model: 'Land Cruiser', emoji: '🚙', color: '#37474F' },
  { id: 'suv-white', category: 'suv', name: 'Кроссовер', brand: 'Kia', model: 'Sportage', emoji: '🚙', color: '#F5F5F5' },
  { id: 'suv-green', category: 'suv', name: 'Внедорожник', brand: 'Land Rover', model: 'Defender', emoji: '🚙', color: '#66BB6A' },
  // --- Спорткары ---
  { id: 'sport-red', category: 'sport', name: 'Спорткар', brand: 'Ferrari', model: 'F8', emoji: '🏎️', color: '#D32F2F' },
  { id: 'sport-yellow', category: 'sport', name: 'Спорткар', brand: 'Lamborghini', model: 'Huracán', emoji: '🏎️', color: '#FDD835' },
  { id: 'sport-orange', category: 'sport', name: 'Спорткар', brand: 'Porsche', model: '911', emoji: '🏎️', color: '#FF9800' },
  // --- Грузовики ---
  { id: 'truck-blue', category: 'truck', name: 'Грузовик', brand: 'KAMAZ', model: '5490', emoji: '🚛', color: '#1E88E5' },
  { id: 'truck-red', category: 'truck', name: 'Фура', brand: 'MAN', model: 'TGX', emoji: '🚚', color: '#E53935' },
  // --- Мотоциклы ---
  { id: 'moto-black', category: 'motorcycle', name: 'Мотоцикл', brand: 'Ducati', model: 'Panigale', emoji: '🏍️', color: '#D32F2F' },
  { id: 'moto-blue', category: 'motorcycle', name: 'Мотоцикл', brand: 'BMW', model: 'R1250', emoji: '🏍️', color: '#1565C0' },
  // --- Велосипеды ---
  { id: 'bicycle', category: 'bicycle', name: 'Велосипед', emoji: '🚲', color: '#43A047' },
  { id: 'ebike', category: 'bicycle', name: 'Электросамокат', emoji: '🛴', color: '#00ACC1' },
  // --- Животные ---
  { id: 'horse', category: 'animal', name: 'Лошадь', emoji: '🐴', color: '#8D6E63' },
  { id: 'dog', category: 'animal', name: 'Собака', emoji: '🐕', color: '#A1887F' },
  { id: 'cat', category: 'animal', name: 'Кот', emoji: '🐈', color: '#FF8A65' },
  { id: 'bear', category: 'animal', name: 'Медведь', emoji: '🐻', color: '#6D4C41' },
  { id: 'eagle', category: 'animal', name: 'Орёл', emoji: '🦅', color: '#5D4037' },
  { id: 'dolphin', category: 'animal', name: 'Дельфин', emoji: '🐬', color: '#0097A7' },
  // --- Летательные аппараты ---
  { id: 'helicopter', category: 'aircraft', name: 'Вертолёт', emoji: '🚁', color: '#546E7A' },
  { id: 'plane', category: 'aircraft', name: 'Самолёт', emoji: '✈️', color: '#78909C' },
  { id: 'rocket', category: 'aircraft', name: 'Ракета', emoji: '🚀', color: '#E64A19' },
  { id: 'ufo', category: 'aircraft', name: 'НЛО', emoji: '🛸', color: '#7E57C2' },
  { id: 'drone', category: 'aircraft', name: 'Дрон', emoji: '🤖', color: '#455A64' },
];

// ─── Режимы отображения карты ────────────────────────────────────────────────
export type MapViewMode = 'standard' | 'satellite' | 'hybrid' | 'terrain' | '3d' | 'dark' | 'light';

// ─── Тема оформления ────────────────────────────────────────────────────────
export type NavTheme = 'dark' | 'light' | 'auto' | 'amap' | 'neon' | 'retro';

// ─── Состояние хранилища ─────────────────────────────────────────────────────
interface NavigatorSettingsState {
  // Звук
  soundMode: SoundMode;
  volume: number; // 0-100
  muteOtherApps: boolean;

  // Голос
  selectedVoice: VoiceId;
  voiceEnabled: boolean;

  // Параметры маршрута
  avoidTolls: boolean;
  avoidUnpaved: boolean;
  avoidHighways: boolean;

  // Транспорт
  selectedVehicle: string; // id метки транспорта
  
  // Карта
  mapViewMode: MapViewMode;
  navTheme: NavTheme;
  show3DBuildings: boolean;
  showTrafficLights: boolean;
  showSpeedBumps: boolean;
  showRoadSigns: boolean;
  showLanes: boolean;
  showSpeedCameras: boolean;
  showPOI: boolean;
  showPanorama: boolean;
  labelSizeMultiplier: number; // 0.7 - 1.5
  highContrastLabels: boolean;

  // Действия
  setSoundMode: (mode: SoundMode) => void;
  setVolume: (v: number) => void;
  setMuteOtherApps: (v: boolean) => void;
  setSelectedVoice: (id: VoiceId) => void;
  setVoiceEnabled: (v: boolean) => void;
  setAvoidTolls: (v: boolean) => void;
  setAvoidUnpaved: (v: boolean) => void;
  setAvoidHighways: (v: boolean) => void;
  setSelectedVehicle: (id: string) => void;
  setMapViewMode: (mode: MapViewMode) => void;
  setNavTheme: (theme: NavTheme) => void;
  setShow3DBuildings: (v: boolean) => void;
  setShowTrafficLights: (v: boolean) => void;
  setShowSpeedBumps: (v: boolean) => void;
  setShowRoadSigns: (v: boolean) => void;
  setShowLanes: (v: boolean) => void;
  setShowSpeedCameras: (v: boolean) => void;
  setShowPOI: (v: boolean) => void;
  setShowPanorama: (v: boolean) => void;
  setLabelSizeMultiplier: (v: number) => void;
  setHighContrastLabels: (v: boolean) => void;
}

export const useNavigatorSettings = create<NavigatorSettingsState>()(
  persist(
    (set) => ({
      // Значения по умолчанию
      soundMode: 'all',
      volume: 80,
      muteOtherApps: false,
      selectedVoice: 'default',
      voiceEnabled: true,
      avoidTolls: false,
      avoidUnpaved: false,
      avoidHighways: false,
      selectedVehicle: 'sedan-white',
      mapViewMode: 'standard',
      navTheme: 'dark',
      show3DBuildings: true,
      showTrafficLights: true,
      showSpeedBumps: true,
      showRoadSigns: true,
      showLanes: true,
      showSpeedCameras: true,
      showPOI: true,
      showPanorama: false,
      labelSizeMultiplier: 1.0,
      highContrastLabels: false,

      // Сеттеры
      setSoundMode: (mode) => set({ soundMode: mode }),
      setVolume: (v) => set({ volume: Math.max(0, Math.min(100, v)) }),
      setMuteOtherApps: (v) => set({ muteOtherApps: v }),
      setSelectedVoice: (id) => set({ selectedVoice: id }),
      setVoiceEnabled: (v) => set({ voiceEnabled: v }),
      setAvoidTolls: (v) => set({ avoidTolls: v }),
      setAvoidUnpaved: (v) => set({ avoidUnpaved: v }),
      setAvoidHighways: (v) => set({ avoidHighways: v }),
      setSelectedVehicle: (id) => set({ selectedVehicle: id }),
      setMapViewMode: (mode) => set({ mapViewMode: mode }),
      setNavTheme: (theme) => set({ navTheme: theme }),
      setShow3DBuildings: (v) => set({ show3DBuildings: v }),
      setShowTrafficLights: (v) => set({ showTrafficLights: v }),
      setShowSpeedBumps: (v) => set({ showSpeedBumps: v }),
      setShowRoadSigns: (v) => set({ showRoadSigns: v }),
      setShowLanes: (v) => set({ showLanes: v }),
       setShowSpeedCameras: (v) => set({ showSpeedCameras: v }),
       setShowPOI: (v) => set({ showPOI: v }),
       setShowPanorama: (v) => set({ showPanorama: v }),
       setLabelSizeMultiplier: (v) => set({ labelSizeMultiplier: Math.max(0.7, Math.min(1.5, v)) }),
       setHighContrastLabels: (v) => set({ highContrastLabels: v }),
     }),
    {
      name: 'navigator-settings',
    },
  ),
);
