/**
 * NavigatorSettingsPage — Full navigator settings UI.
 * Voice, sound modes, vehicle marker, route preferences, map view, theme.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, VolumeX, Car, Mic, Map, Palette, Route, Shield, ChevronRight, Check, Text, Contrast } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  useNavigatorSettings,
  VOICE_OPTIONS,
  VEHICLE_MARKERS,
  type SoundMode,
  type VoiceId,
  type NavTheme,
  type MapViewMode,
} from '@/stores/navigatorSettingsStore';
import { speakNavigation } from '@/lib/navigation/voiceAssistant';

type Section = 'main' | 'voice' | 'sound' | 'vehicle' | 'route' | 'map' | 'theme' | 'display';

const SOUND_MODES: { id: SoundMode; label: string; emoji: string }[] = [
  { id: 'all', label: 'Все звуки', emoji: '🔊' },
  { id: 'cameras', label: 'Только камеры', emoji: '📸' },
  { id: 'turns', label: 'Только повороты', emoji: '↪️' },
  { id: 'police', label: 'Только посты ДПС', emoji: '👮' },
  { id: 'signs', label: 'Только знаки', emoji: '🚧' },
  { id: 'mute', label: 'Без звука', emoji: '🔇' },
];

const THEMES: { id: NavTheme; label: string; color: string }[] = [
  { id: 'dark', label: 'Тёмная', color: '#1a1a2e' },
  { id: 'light', label: 'Светлая', color: '#f5f5f5' },
  { id: 'auto', label: 'Авто', color: '#6366f1' },
  { id: 'amap', label: 'Amap', color: '#0066ff' },
  { id: 'neon', label: 'Неон', color: '#ff00ff' },
  { id: 'retro', label: 'Ретро', color: '#d4a574' },
];

const MAP_VIEWS: { id: MapViewMode; label: string; emoji: string }[] = [
  { id: 'standard', label: 'Стандарт', emoji: '🗺️' },
  { id: 'satellite', label: 'Спутник', emoji: '🛰️' },
  { id: 'hybrid', label: 'Гибрид', emoji: '🌍' },
  { id: 'terrain', label: 'Рельеф', emoji: '⛰️' },
  { id: '3d', label: '3D', emoji: '🏙️' },
  { id: 'dark', label: 'Тёмная', emoji: '🌑' },
  { id: 'light', label: 'Светлая', emoji: '☀️' },
];

const VEHICLE_CATEGORIES = [
  { id: 'car', label: 'Легковые' },
  { id: 'suv', label: 'Внедорожники' },
  { id: 'sport', label: 'Спорткары' },
  { id: 'truck', label: 'Грузовики' },
  { id: 'motorcycle', label: 'Мотоциклы' },
  { id: 'bicycle', label: 'Велосипеды' },
  { id: 'animal', label: 'Животные' },
  { id: 'aircraft', label: 'Летательные' },
] as const;

export default function NavigatorSettingsPage() {
  const routerNav = useNavigate();
  const settings = useNavigatorSettings();
  const [section, setSection] = useState<Section>('main');
  const [vehicleCategory, setVehicleCategory] = useState<string>('car');

  if (section !== 'main') {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="sticky top-0 z-50 flex items-center gap-3 p-4 bg-gray-950/90 backdrop-blur-md border-b border-white/5">
          <button onClick={() => setSection('main')} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">
            {section === 'voice' && 'Голос'}
            {section === 'sound' && 'Режим звука'}
            {section === 'vehicle' && 'Метка на карте'}
            {section === 'route' && 'Маршрут'}
            {section === 'map' && 'Вид карты'}
            {section === 'theme' && 'Тема'}
            {section === 'display' && 'Отображение'}
          </h1>
        </header>

        <div className="p-4 space-y-4 pb-20">
          {/* ═══ Voice Settings ═══ */}
          {section === 'voice' && (
            <>
              <div className="space-y-3">
                {VOICE_OPTIONS.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => {
                      settings.setSelectedVoice(voice.id);
                      setTimeout(() => speakNavigation('Привет! Я ваш голосовой помощник.', 'info'), 100);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-4 rounded-xl transition-colors',
                      settings.selectedVoice === voice.id
                        ? 'bg-blue-500/20 border border-blue-500/40'
                        : 'bg-white/5 border border-white/5 hover:bg-white/10'
                    )}
                  >
                    <div className="text-left">
                      <p className="font-medium">{voice.label}</p>
                      <p className="text-sm text-gray-400">{voice.description}</p>
                    </div>
                    {settings.selectedVoice === voice.id && (
                      <Check className="h-5 w-5 text-blue-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Скорость речи</label>
                  <Slider
                    defaultValue={[
                      (VOICE_OPTIONS.find(v => v.id === settings.selectedVoice)?.rate ?? 1) * 100
                    ]}
                    min={50}
                    max={150}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Медленно</span>
                    <span>Быстро</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══ Sound Mode ═══ */}
          {section === 'sound' && (
            <>
              <div className="space-y-3">
                {SOUND_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => settings.setSoundMode(mode.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-4 rounded-xl transition-colors',
                      settings.soundMode === mode.id
                        ? 'bg-blue-500/20 border border-blue-500/40'
                        : 'bg-white/5 border border-white/5 hover:bg-white/10'
                    )}
                  >
                    <span className="text-2xl">{mode.emoji}</span>
                    <span className="font-medium">{mode.label}</span>
                    {settings.soundMode === mode.id && (
                      <Check className="h-5 w-5 text-blue-400 ml-auto" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Громкость</label>
                  <div className="flex items-center gap-3">
                    <VolumeX className="h-4 w-4 text-gray-500 shrink-0" />
                    <Slider
                      value={[settings.volume]}
                      onValueChange={([v]) => settings.setVolume(v)}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <Volume2 className="h-4 w-4 text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-400 w-8 text-right">{settings.volume}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div>
                    <p className="font-medium">Заглушать другие приложения</p>
                    <p className="text-sm text-gray-400">Приглушать музыку и другие звуки</p>
                  </div>
                  <Switch
                    checked={settings.muteOtherApps}
                    onCheckedChange={settings.setMuteOtherApps}
                  />
                </div>
              </div>
            </>
          )}

          {/* ═══ Vehicle Marker ═══ */}
          {section === 'vehicle' && (
            <>
              {/* Category tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {VEHICLE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setVehicleCategory(cat.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                      vehicleCategory === cat.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/15'
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Vehicle grid */}
              <div className="grid grid-cols-3 gap-3 mt-2">
                {VEHICLE_MARKERS.filter(v => v.category === vehicleCategory).map((vehicle) => (
                  <button
                    key={vehicle.id}
                    onClick={() => settings.setSelectedVehicle(vehicle.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl transition-all',
                      settings.selectedVehicle === vehicle.id
                        ? 'bg-blue-500/20 border-2 border-blue-500 scale-105'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    )}
                  >
                    <span className="text-4xl">{vehicle.emoji}</span>
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white/30"
                      style={{ backgroundColor: vehicle.color }}
                    />
                    <div className="text-center">
                      <p className="text-xs font-medium">{vehicle.name}</p>
                      {vehicle.brand && (
                        <p className="text-[10px] text-gray-400">{vehicle.brand} {vehicle.model}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ═══ Route Preferences ═══ */}
          {section === 'route' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium">Избегать платных дорог</p>
                  <p className="text-sm text-gray-400">Строить маршрут без платных участков</p>
                </div>
                <Switch
                  checked={settings.avoidTolls}
                  onCheckedChange={settings.setAvoidTolls}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium">Избегать грунтовых дорог</p>
                  <p className="text-sm text-gray-400">Не использовать плохие и грунтовые дороги</p>
                </div>
                <Switch
                  checked={settings.avoidUnpaved}
                  onCheckedChange={settings.setAvoidUnpaved}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium">Избегать магистралей</p>
                  <p className="text-sm text-gray-400">Строить маршрут без скоростных дорог</p>
                </div>
                <Switch
                  checked={settings.avoidHighways}
                  onCheckedChange={settings.setAvoidHighways}
                />
              </div>
            </div>
          )}

          {/* ═══ Map View ═══ */}
          {section === 'map' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {MAP_VIEWS.map((view) => (
                  <button
                    key={view.id}
                    onClick={() => settings.setMapViewMode(view.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl transition-all',
                      settings.mapViewMode === view.id
                        ? 'bg-blue-500/20 border-2 border-blue-500'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    )}
                  >
                    <span className="text-3xl">{view.emoji}</span>
                    <p className="text-xs font-medium">{view.label}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium">Панорамы</p>
                  <p className="text-sm text-gray-400">Показывать уличные панорамы</p>
                </div>
                <Switch
                  checked={settings.showPanorama}
                  onCheckedChange={settings.setShowPanorama}
                />
              </div>
            </>
          )}

          {/* ═══ Theme ═══ */}
          {section === 'theme' && (
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => settings.setNavTheme(theme.id)}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl transition-all',
                    settings.navTheme === theme.id
                      ? 'bg-blue-500/20 border-2 border-blue-500'
                      : 'bg-white/5 border border-white/10 hover:bg-white/10'
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-lg border border-white/20"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="font-medium">{theme.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* ═══ Display Settings ═══ */}
          {section === 'display' && (
            <div className="space-y-4">
              {/* Toggle switches */}
              {[
                { label: '3D здания', value: settings.show3DBuildings, setter: settings.setShow3DBuildings },
                { label: 'Светофоры', value: settings.showTrafficLights, setter: settings.setShowTrafficLights },
                { label: 'Лежачие полицейские', value: settings.showSpeedBumps, setter: settings.setShowSpeedBumps },
                { label: 'Дорожные знаки', value: settings.showRoadSigns, setter: settings.setShowRoadSigns },
                { label: 'Полосы движения', value: settings.showLanes, setter: settings.setShowLanes },
                { label: 'Камеры скорости', value: settings.showSpeedCameras, setter: settings.setShowSpeedCameras },
                { label: 'Точки интереса (POI)', value: settings.showPOI, setter: settings.setShowPOI },
              ].map(({ label, value, setter }) => (
                <div key={label} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <span className="font-medium">{label}</span>
                  <Switch checked={value} onCheckedChange={setter} />
                </div>
              ))}

              {/* Divider */}
              <div className="pt-2 border-t border-white/10" />

              {/* Label size slider */}
              <div className="p-4 bg-white/5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Text className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">Размер текста на карте</span>
                  </div>
                  <span className="text-sm text-gray-400">{Math.round(settings.labelSizeMultiplier * 100)}%</span>
                </div>
                <Slider
                  value={[settings.labelSizeMultiplier * 100]}
                  onValueChange={([v]) => settings.setLabelSizeMultiplier(v / 100)}
                  min={70}
                  max={150}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Меньше</span>
                  <span>Больше</span>
                </div>
              </div>

              {/* High contrast toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Contrast className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="font-medium">Высокая контрастность</p>
                    <p className="text-sm text-gray-400">Увеличивает обводку текста для лучшей читаемости</p>
                  </div>
                </div>
                <Switch
                  checked={settings.highContrastLabels}
                  onCheckedChange={settings.setHighContrastLabels}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ Main settings menu ═══
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 flex items-center gap-3 p-4 bg-gray-950/90 backdrop-blur-md border-b border-white/5">
        <button onClick={() => routerNav(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Настройки навигатора</h1>
      </header>

      <div className="p-4 space-y-2 pb-20">
        <MenuItem
          icon={<Mic className="h-5 w-5 text-blue-400" />}
          label="Голосовой помощник"
          subtitle={VOICE_OPTIONS.find(v => v.id === settings.selectedVoice)?.label}
          onClick={() => setSection('voice')}
        />
        <MenuItem
          icon={<Volume2 className="h-5 w-5 text-green-400" />}
          label="Режим звука"
          subtitle={SOUND_MODES.find(m => m.id === settings.soundMode)?.label}
          onClick={() => setSection('sound')}
        />
        <MenuItem
          icon={<Car className="h-5 w-5 text-yellow-400" />}
          label="Метка на карте"
          subtitle={VEHICLE_MARKERS.find(v => v.id === settings.selectedVehicle)?.name}
          onClick={() => setSection('vehicle')}
        />
        <MenuItem
          icon={<Route className="h-5 w-5 text-purple-400" />}
          label="Маршрут"
          subtitle={[
            settings.avoidTolls && 'без платных',
            settings.avoidUnpaved && 'без грунтовых',
          ].filter(Boolean).join(', ') || 'Без ограничений'}
          onClick={() => setSection('route')}
        />
        <MenuItem
          icon={<Map className="h-5 w-5 text-cyan-400" />}
          label="Вид карты"
          subtitle={MAP_VIEWS.find(v => v.id === settings.mapViewMode)?.label}
          onClick={() => setSection('map')}
        />
        <MenuItem
          icon={<Palette className="h-5 w-5 text-pink-400" />}
          label="Тема"
          subtitle={THEMES.find(t => t.id === settings.navTheme)?.label}
          onClick={() => setSection('theme')}
        />
        <MenuItem
          icon={<Shield className="h-5 w-5 text-orange-400" />}
          label="Отображение на карте"
          subtitle="Здания, светофоры, знаки, полосы"
          onClick={() => setSection('display')}
        />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, subtitle, onClick }: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
    >
      {icon}
      <div className="flex-1 text-left">
        <p className="font-medium">{label}</p>
        {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-gray-500" />
    </button>
  );
}
