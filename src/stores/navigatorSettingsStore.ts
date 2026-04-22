/**
 * navigatorSettingsStore — Хранилище настроек навигатора (Zustand).
 * Сохраняется в localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { navText } from '@/lib/navigation/navigationUi';

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

interface VoiceProfileDefinition {
  id: VoiceId;
  labelRu: string;
  labelEn: string;
  lang: string;
  rate: number;
  pitch: number;
  descriptionRu: string;
  descriptionEn: string;
}

const VOICE_PROFILE_DEFINITIONS: VoiceProfileDefinition[] = [
  { id: 'default', labelRu: 'Стандартный', labelEn: 'Default', lang: 'ru-RU', rate: 1.05, pitch: 1.0, descriptionRu: 'Системный голос', descriptionEn: 'System voice' },
  { id: 'alice', labelRu: 'Алиса', labelEn: 'Alice', lang: 'ru-RU', rate: 1.0, pitch: 1.2, descriptionRu: 'Женский, дружелюбный', descriptionEn: 'Female, friendly' },
  { id: 'dmitry', labelRu: 'Дмитрий', labelEn: 'Dmitry', lang: 'ru-RU', rate: 0.95, pitch: 0.8, descriptionRu: 'Мужской, спокойный', descriptionEn: 'Male, calm' },
  { id: 'elena', labelRu: 'Елена', labelEn: 'Elena', lang: 'ru-RU', rate: 1.1, pitch: 1.1, descriptionRu: 'Женский, уверенный', descriptionEn: 'Female, confident' },
  { id: 'natasha', labelRu: 'Наташа', labelEn: 'Natasha', lang: 'ru-RU', rate: 1.0, pitch: 1.3, descriptionRu: 'Женский, мягкий', descriptionEn: 'Female, soft' },
  { id: 'maxim', labelRu: 'Максим', labelEn: 'Maxim', lang: 'ru-RU', rate: 0.9, pitch: 0.7, descriptionRu: 'Мужской, низкий', descriptionEn: 'Male, deep' },
];

export const VOICE_OPTIONS: VoiceOption[] = VOICE_PROFILE_DEFINITIONS.map((voice) => ({
  id: voice.id,
  label: voice.labelEn,
  lang: voice.lang,
  rate: voice.rate,
  pitch: voice.pitch,
  description: voice.descriptionEn,
}));

export function getVoiceOptions(languageCode?: string | null): VoiceOption[] {
  return VOICE_PROFILE_DEFINITIONS.map((voice) => ({
    id: voice.id,
    label: navText(voice.labelRu, voice.labelEn, languageCode),
    lang: voice.lang,
    rate: voice.rate,
    pitch: voice.pitch,
    description: navText(voice.descriptionRu, voice.descriptionEn, languageCode),
  }));
}

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

interface VehicleMarkerDefinition {
  id: string;
  category: VehicleCategory;
  nameRu: string;
  nameEn: string;
  brand?: string;
  model?: string;
  emoji: string;
  color: string;
}

const VEHICLE_MARKER_DEFINITIONS: VehicleMarkerDefinition[] = [
  { id: 'navigation-arrow', category: 'custom', nameRu: 'Навигационная стрелка', nameEn: 'Navigation arrow', emoji: '➤', color: '#38BDF8' },
  { id: 'sedan-white', category: 'car', nameRu: 'Седан', nameEn: 'Sedan', brand: 'Toyota', model: 'Camry', emoji: '🚗', color: '#ECEFF1' },
  { id: 'sedan-black', category: 'car', nameRu: 'Седан', nameEn: 'Sedan', brand: 'BMW', model: '5 Series', emoji: '🚗', color: '#263238' },
  { id: 'sedan-red', category: 'car', nameRu: 'Седан', nameEn: 'Sedan', brand: 'Audi', model: 'A6', emoji: '🚗', color: '#EF5350' },
  { id: 'sedan-blue', category: 'car', nameRu: 'Седан', nameEn: 'Sedan', brand: 'Mercedes', model: 'E-Class', emoji: '🚗', color: '#42A5F5' },
  { id: 'hatch-yellow', category: 'car', nameRu: 'Хэтчбэк', nameEn: 'Hatchback', brand: 'Volkswagen', model: 'Golf', emoji: '🚗', color: '#FFEE58' },
  { id: 'suv-black', category: 'suv', nameRu: 'Внедорожник', nameEn: 'SUV', brand: 'Toyota', model: 'Land Cruiser', emoji: '🚙', color: '#37474F' },
  { id: 'suv-white', category: 'suv', nameRu: 'Кроссовер', nameEn: 'Crossover', brand: 'Kia', model: 'Sportage', emoji: '🚙', color: '#F5F5F5' },
  { id: 'suv-green', category: 'suv', nameRu: 'Внедорожник', nameEn: 'SUV', brand: 'Land Rover', model: 'Defender', emoji: '🚙', color: '#66BB6A' },
  { id: 'sport-red', category: 'sport', nameRu: 'Спорткар', nameEn: 'Sports car', brand: 'Ferrari', model: 'F8', emoji: '🏎️', color: '#D32F2F' },
  { id: 'sport-yellow', category: 'sport', nameRu: 'Спорткар', nameEn: 'Sports car', brand: 'Lamborghini', model: 'Huracán', emoji: '🏎️', color: '#FDD835' },
  { id: 'sport-orange', category: 'sport', nameRu: 'Спорткар', nameEn: 'Sports car', brand: 'Porsche', model: '911', emoji: '🏎️', color: '#FF9800' },
  { id: 'truck-blue', category: 'truck', nameRu: 'Грузовик', nameEn: 'Truck', brand: 'KAMAZ', model: '5490', emoji: '🚛', color: '#1E88E5' },
  { id: 'truck-red', category: 'truck', nameRu: 'Фура', nameEn: 'Semi truck', brand: 'MAN', model: 'TGX', emoji: '🚚', color: '#E53935' },
  { id: 'moto-black', category: 'motorcycle', nameRu: 'Мотоцикл', nameEn: 'Motorcycle', brand: 'Ducati', model: 'Panigale', emoji: '🏍️', color: '#D32F2F' },
  { id: 'moto-blue', category: 'motorcycle', nameRu: 'Мотоцикл', nameEn: 'Motorcycle', brand: 'BMW', model: 'R1250', emoji: '🏍️', color: '#1565C0' },
  { id: 'bicycle', category: 'bicycle', nameRu: 'Велосипед', nameEn: 'Bicycle', emoji: '🚲', color: '#43A047' },
  { id: 'ebike', category: 'bicycle', nameRu: 'Электросамокат', nameEn: 'E-scooter', emoji: '🛴', color: '#00ACC1' },
  { id: 'horse', category: 'animal', nameRu: 'Лошадь', nameEn: 'Horse', emoji: '🐴', color: '#8D6E63' },
  { id: 'dog', category: 'animal', nameRu: 'Собака', nameEn: 'Dog', emoji: '🐕', color: '#A1887F' },
  { id: 'cat', category: 'animal', nameRu: 'Кот', nameEn: 'Cat', emoji: '🐈', color: '#FF8A65' },
  { id: 'bear', category: 'animal', nameRu: 'Медведь', nameEn: 'Bear', emoji: '🐻', color: '#6D4C41' },
  { id: 'eagle', category: 'animal', nameRu: 'Орёл', nameEn: 'Eagle', emoji: '🦅', color: '#5D4037' },
  { id: 'dolphin', category: 'animal', nameRu: 'Дельфин', nameEn: 'Dolphin', emoji: '🐬', color: '#0097A7' },
  { id: 'helicopter', category: 'aircraft', nameRu: 'Вертолёт', nameEn: 'Helicopter', emoji: '🚁', color: '#546E7A' },
  { id: 'plane', category: 'aircraft', nameRu: 'Самолёт', nameEn: 'Plane', emoji: '✈️', color: '#78909C' },
  { id: 'rocket', category: 'aircraft', nameRu: 'Ракета', nameEn: 'Rocket', emoji: '🚀', color: '#E64A19' },
  { id: 'ufo', category: 'aircraft', nameRu: 'НЛО', nameEn: 'UFO', emoji: '🛸', color: '#7E57C2' },
  { id: 'drone', category: 'aircraft', nameRu: 'Дрон', nameEn: 'Drone', emoji: '🤖', color: '#455A64' },
];

export function getVehicleMarkers(languageCode?: string | null): VehicleMarker[] {
  return VEHICLE_MARKER_DEFINITIONS.map((vehicle) => ({
    id: vehicle.id,
    category: vehicle.category,
    name: navText(vehicle.nameRu, vehicle.nameEn, languageCode),
    brand: vehicle.brand,
    model: vehicle.model,
    emoji: vehicle.emoji,
    color: vehicle.color,
  }));
}

export function getVehicleMarkerDefinition(vehicleId: string): VehicleMarker | null {
  const vehicle = VEHICLE_MARKER_DEFINITIONS.find((entry) => entry.id === vehicleId);
  if (!vehicle) return null;

  return {
    id: vehicle.id,
    category: vehicle.category,
    name: vehicle.nameEn,
    brand: vehicle.brand,
    model: vehicle.model,
    emoji: vehicle.emoji,
    color: vehicle.color,
  };
}

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
  voiceLearningEnabled: boolean;
  voiceBackendSyncEnabled: boolean;
  voiceAllowOnlineFallback: boolean;

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
  showTrafficFlowOverlay: boolean;
  showTrafficLights: boolean;
  showTransitOverlay: boolean;
  showSpeedBumps: boolean;
  showRoadSigns: boolean;
   showLanes: boolean;
   showSpeedCameras: boolean;
   showMapEdits: boolean;          // proposed/approved survey scans
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
  setVoiceLearningEnabled: (v: boolean) => void;
  setVoiceBackendSyncEnabled: (v: boolean) => void;
  setVoiceAllowOnlineFallback: (v: boolean) => void;
  setAvoidTolls: (v: boolean) => void;
  setAvoidUnpaved: (v: boolean) => void;
  setAvoidHighways: (v: boolean) => void;
  setSelectedVehicle: (id: string) => void;
  setMapViewMode: (mode: MapViewMode) => void;
  setNavTheme: (theme: NavTheme) => void;
  setShow3DBuildings: (v: boolean) => void;
  setShowTrafficFlowOverlay: (v: boolean) => void;
  setShowTrafficLights: (v: boolean) => void;
  setShowTransitOverlay: (v: boolean) => void;
  setShowSpeedBumps: (v: boolean) => void;
  setShowRoadSigns: (v: boolean) => void;
   setShowLanes: (v: boolean) => void;
   setShowSpeedCameras: (v: boolean) => void;
   setShowMapEdits: (v: boolean) => void;
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
      voiceLearningEnabled: true,
      voiceBackendSyncEnabled: true,
      voiceAllowOnlineFallback: true,
      avoidTolls: false,
      avoidUnpaved: false,
      avoidHighways: false,
      selectedVehicle: 'sedan-white',
      mapViewMode: 'standard',
      navTheme: 'dark',
      show3DBuildings: true,
      showTrafficFlowOverlay: true,
      showTrafficLights: true,
      showTransitOverlay: true,
      showSpeedBumps: true,
      showRoadSigns: true,
       showLanes: true,
       showSpeedCameras: true,
       showMapEdits: true,          // new: show survey scans layer
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
      setVoiceLearningEnabled: (v) => set({ voiceLearningEnabled: v }),
      setVoiceBackendSyncEnabled: (v) => set({ voiceBackendSyncEnabled: v }),
      setVoiceAllowOnlineFallback: (v) => set({ voiceAllowOnlineFallback: v }),
      setAvoidTolls: (v) => set({ avoidTolls: v }),
      setAvoidUnpaved: (v) => set({ avoidUnpaved: v }),
      setAvoidHighways: (v) => set({ avoidHighways: v }),
      setSelectedVehicle: (id) => set({ selectedVehicle: id }),
      setMapViewMode: (mode) => set({ mapViewMode: mode }),
      setNavTheme: (theme) => set({ navTheme: theme }),
      setShow3DBuildings: (v) => set({ show3DBuildings: v }),
      setShowTrafficFlowOverlay: (v) => set({ showTrafficFlowOverlay: v }),
      setShowTrafficLights: (v) => set({ showTrafficLights: v }),
      setShowTransitOverlay: (v) => set({ showTransitOverlay: v }),
      setShowSpeedBumps: (v) => set({ showSpeedBumps: v }),
      setShowRoadSigns: (v) => set({ showRoadSigns: v }),
        setShowLanes: (v) => set({ showLanes: v }),
        setShowSpeedCameras: (v) => set({ showSpeedCameras: v }),
        setShowMapEdits: (v) => set({ showMapEdits: v }),
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
