import { useEffect, useState, type ReactNode } from 'react';
import { Car, Check, Map, Mic, Route, Settings2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';
import {
  useNavigatorSettings,
  getVoiceOptions,
  getVehicleMarkers,
  type MapViewMode,
  type NavTheme,
  type SoundMode,
} from '@/stores/navigatorSettingsStore';

type SettingsSection = 'route' | 'map' | 'display' | 'sound' | 'voice' | 'vehicle';

interface NavigatorSettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: string;
}

export function NavigatorSettingsPopover({
  open,
  onOpenChange,
  triggerClassName,
}: NavigatorSettingsPopoverProps) {
  const settings = useNavigatorSettings();
  const { settings: userSettings } = useUserSettings();
  const languageCode = userSettings?.language_code ?? null;
  const [section, setSection] = useState<SettingsSection>('display');
  const [vehicleCategory, setVehicleCategory] = useState<string>('car');

  const sectionItems: Array<{ id: SettingsSection; label: string; icon: typeof Route }> = [
    { id: 'route', label: navText('Маршрут', 'Route', languageCode), icon: Route },
    { id: 'map', label: navText('Карта', 'Map', languageCode), icon: Map },
    { id: 'display', label: navText('Слои', 'Layers', languageCode), icon: Settings2 },
    { id: 'sound', label: navText('Звук', 'Sound', languageCode), icon: Volume2 },
    { id: 'voice', label: navText('Голос', 'Voice', languageCode), icon: Mic },
    { id: 'vehicle', label: navText('Метка', 'Marker', languageCode), icon: Car },
  ];

  const mapViews: Array<{ id: MapViewMode; label: string }> = [
    { id: 'standard', label: navText('Схема', 'Standard', languageCode) },
    { id: 'satellite', label: navText('Спутник', 'Satellite', languageCode) },
    { id: 'hybrid', label: navText('Гибрид', 'Hybrid', languageCode) },
    { id: 'terrain', label: navText('Рельеф', 'Terrain', languageCode) },
    { id: '3d', label: '3D' },
    { id: 'dark', label: navText('Тёмная', 'Dark', languageCode) },
    { id: 'light', label: navText('Светлая', 'Light', languageCode) },
  ];

  const navThemes: Array<{ id: NavTheme; label: string; color: string }> = [
    { id: 'dark', label: navText('Тёмная', 'Dark', languageCode), color: '#111827' },
    { id: 'light', label: navText('Светлая', 'Light', languageCode), color: '#e5e7eb' },
    { id: 'auto', label: navText('Авто', 'Auto', languageCode), color: '#6366f1' },
    { id: 'amap', label: 'Amap', color: '#0ea5e9' },
    { id: 'neon', label: navText('Неон', 'Neon', languageCode), color: '#d946ef' },
    { id: 'retro', label: navText('Ретро', 'Retro', languageCode), color: '#b45309' },
  ];

  const soundModes: Array<{ id: SoundMode; label: string }> = [
    { id: 'all', label: navText('Все звуки', 'All sounds', languageCode) },
    { id: 'cameras', label: navText('Только камеры', 'Cameras only', languageCode) },
    { id: 'turns', label: navText('Только повороты', 'Turns only', languageCode) },
    { id: 'police', label: navText('Только посты', 'Police only', languageCode) },
    { id: 'signs', label: navText('Только знаки', 'Signs only', languageCode) },
    { id: 'mute', label: navText('Без звука', 'Mute', languageCode) },
  ];

  const vehicleCategoryItems = [
    { id: 'car', label: navText('Авто', 'Car', languageCode) },
    { id: 'suv', label: 'SUV' },
    { id: 'sport', label: navText('Спорт', 'Sport', languageCode) },
    { id: 'truck', label: navText('Груз', 'Truck', languageCode) },
    { id: 'motorcycle', label: navText('Мото', 'Moto', languageCode) },
    { id: 'bicycle', label: navText('Вело', 'Bike', languageCode) },
    { id: 'animal', label: navText('Жив.', 'Animal', languageCode) },
    { id: 'aircraft', label: navText('Полёт', 'Flight', languageCode) },
    { id: 'custom', label: navText('Сист.', 'System', languageCode) },
  ] as const;

  const voiceOptions = getVoiceOptions(languageCode);
  const vehicleMarkers = getVehicleMarkers(languageCode);

  const selectedVehicle = vehicleMarkers.find((vehicle) => vehicle.id === settings.selectedVehicle) ?? vehicleMarkers[0];
  const filteredVehicles = vehicleMarkers.filter((vehicle) => vehicle.category === vehicleCategory);

  useEffect(() => {
    if (!selectedVehicle) return;
    setVehicleCategory(selectedVehicle.category);
  }, [selectedVehicle?.id]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className={triggerClassName} aria-label={navText('Настройки навигатора', 'Navigator settings', languageCode)}>
          <Settings2 className="h-5 w-5 text-gray-200" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="w-[min(26rem,calc(100vw-1rem))] rounded-3xl border border-white/10 bg-gray-950/96 p-0 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem]">
          <ScrollArea className="order-1 max-h-[70dvh] p-4">
            <div className="space-y-4 pr-3">
              {section === 'route' && (
                <>
                  <ToggleRow
                    label={navText('Избегать платных дорог', 'Avoid toll roads', languageCode)}
                    description={navText('Маршрут без платных участков', 'Build routes without toll segments', languageCode)}
                    value={settings.avoidTolls}
                    onChange={settings.setAvoidTolls}
                  />
                  <ToggleRow
                    label={navText('Избегать грунтовых дорог', 'Avoid unpaved roads', languageCode)}
                    description={navText('Не использовать плохие покрытия', 'Skip poor surface roads', languageCode)}
                    value={settings.avoidUnpaved}
                    onChange={settings.setAvoidUnpaved}
                  />
                  <ToggleRow
                    label={navText('Избегать магистралей', 'Avoid highways', languageCode)}
                    description={navText('Снижать долю скоростных трасс', 'Reduce highway-heavy routing', languageCode)}
                    value={settings.avoidHighways}
                    onChange={settings.setAvoidHighways}
                  />
                </>
              )}

              {section === 'map' && (
                <>
                  <SectionBlock title={navText('Вид карты', 'Map view', languageCode)}>
                    <div className="grid grid-cols-2 gap-2">
                      {mapViews.map((view) => (
                        <SelectableChip
                          key={view.id}
                          active={settings.mapViewMode === view.id}
                          label={view.label}
                          onClick={() => settings.setMapViewMode(view.id)}
                        />
                      ))}
                    </div>
                  </SectionBlock>

                  <SectionBlock title={navText('Тема', 'Theme', languageCode)}>
                    <div className="grid grid-cols-2 gap-2">
                      {navThemes.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => settings.setNavTheme(theme.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors',
                            settings.navTheme === theme.id
                              ? 'border-blue-400/30 bg-blue-500/15 text-blue-100'
                              : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10',
                          )}
                        >
                          <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: theme.color }} />
                          <span className="flex-1">{theme.label}</span>
                          {settings.navTheme === theme.id && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  </SectionBlock>

                  <ToggleRow
                    label={navText('Панорамы', 'Panoramas', languageCode)}
                    description={navText('Показывать панорамные точки на карте', 'Show panorama points on the map', languageCode)}
                    value={settings.showPanorama}
                    onChange={settings.setShowPanorama}
                  />
                </>
              )}

              {section === 'display' && (
                <>
                  <ToggleRow label={navText('3D здания', '3D buildings', languageCode)} value={settings.show3DBuildings} onChange={settings.setShow3DBuildings} />
                  <ToggleRow label={navText('Поток пробок', 'Traffic flow', languageCode)} value={settings.showTrafficFlowOverlay} onChange={settings.setShowTrafficFlowOverlay} />
                  <ToggleRow label={navText('Светофоры', 'Traffic lights', languageCode)} value={settings.showTrafficLights} onChange={settings.setShowTrafficLights} />
                  <ToggleRow label={navText('Метро и ОТ', 'Metro and transit', languageCode)} value={settings.showTransitOverlay} onChange={settings.setShowTransitOverlay} />
                  <ToggleRow label={navText('Дорожные знаки', 'Road signs', languageCode)} value={settings.showRoadSigns} onChange={settings.setShowRoadSigns} />
                  <ToggleRow label={navText('Полосы движения', 'Lane guidance', languageCode)} value={settings.showLanes} onChange={settings.setShowLanes} />
                  <ToggleRow label={navText('Камеры скорости', 'Speed cameras', languageCode)} value={settings.showSpeedCameras} onChange={settings.setShowSpeedCameras} />
                  <ToggleRow label={navText('Точки интереса', 'Points of interest', languageCode)} value={settings.showPOI} onChange={settings.setShowPOI} />
                  <ToggleRow label={navText('Лежачие полицейские', 'Speed bumps', languageCode)} value={settings.showSpeedBumps} onChange={settings.setShowSpeedBumps} />
                  <ToggleRow label={navText('Высокая контрастность', 'High contrast', languageCode)} value={settings.highContrastLabels} onChange={settings.setHighContrastLabels} />

                  <SectionBlock title={navText('Размер подписей', 'Label size', languageCode)}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-gray-300">
                        <span>{navText('Масштаб текста', 'Text scale', languageCode)}</span>
                        <span>{Math.round(settings.labelSizeMultiplier * 100)}%</span>
                      </div>
                      <Slider
                        value={[settings.labelSizeMultiplier * 100]}
                        onValueChange={([value]) => settings.setLabelSizeMultiplier(value / 100)}
                        min={70}
                        max={150}
                        step={5}
                      />
                    </div>
                  </SectionBlock>
                </>
              )}

              {section === 'sound' && (
                <>
                  <ToggleRow
                    label={navText('Голосовые подсказки', 'Voice guidance', languageCode)}
                    description={navText('Озвучивать повороты и события', 'Announce turns and events', languageCode)}
                    value={settings.voiceEnabled}
                    onChange={settings.setVoiceEnabled}
                  />
                  <ToggleRow
                    label={navText('Заглушать другие приложения', 'Mute other apps', languageCode)}
                    description={navText('Приглушать музыку при подсказках', 'Lower music volume during prompts', languageCode)}
                    value={settings.muteOtherApps}
                    onChange={settings.setMuteOtherApps}
                  />

                  <SectionBlock title={navText('Режим звука', 'Sound mode', languageCode)}>
                    <div className="grid grid-cols-2 gap-2">
                      {soundModes.map((mode) => (
                        <SelectableChip
                          key={mode.id}
                          active={settings.soundMode === mode.id}
                          label={mode.label}
                          onClick={() => settings.setSoundMode(mode.id)}
                        />
                      ))}
                    </div>
                  </SectionBlock>

                  <SectionBlock title={navText('Громкость', 'Volume', languageCode)}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-gray-300">
                        <span>{navText('Уровень', 'Level', languageCode)}</span>
                        <span>{settings.volume}%</span>
                      </div>
                      <Slider
                        value={[settings.volume]}
                        onValueChange={([value]) => settings.setVolume(value)}
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>
                  </SectionBlock>
                </>
              )}

              {section === 'voice' && (
                <SectionBlock title={navText('Голосовой помощник', 'Voice assistant', languageCode)}>
                  <div className="space-y-2">
                    {voiceOptions.map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() => settings.setSelectedVoice(voice.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors',
                          settings.selectedVoice === voice.id
                            ? 'border-blue-400/30 bg-blue-500/15 text-blue-100'
                            : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">{voice.label}</p>
                          <p className="mt-1 text-xs text-gray-500">{voice.description}</p>
                        </div>
                        {settings.selectedVoice === voice.id && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    <ToggleRow
                      label={navText('Локальное обучение адресов', 'Local address learning', languageCode)}
                      description={navText('Запоминать подтверждённые голосовые адреса на устройстве', 'Remember confirmed voice addresses on this device', languageCode)}
                      value={settings.voiceLearningEnabled}
                      onChange={settings.setVoiceLearningEnabled}
                    />
                    <ToggleRow
                      label={navText('Синхронизация voice-learning', 'Voice learning sync', languageCode)}
                      description={navText('Отправлять голосовые события и исправления в backend', 'Send voice events and corrections to the backend', languageCode)}
                      value={settings.voiceBackendSyncEnabled}
                      onChange={settings.setVoiceBackendSyncEnabled}
                    />
                    <ToggleRow
                      label={navText('Онлайн fallback геокодеров', 'Online geocoder fallback', languageCode)}
                      description={navText('Разрешить внешние провайдеры только как резервный путь', 'Allow external providers only as a fallback path', languageCode)}
                      value={settings.voiceAllowOnlineFallback}
                      onChange={settings.setVoiceAllowOnlineFallback}
                    />
                  </div>
                </SectionBlock>
              )}

              {section === 'vehicle' && (
                <>
                  <SectionBlock title={navText('Активная метка', 'Active marker', languageCode)}>
                    <div className="flex items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-3 py-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 text-2xl"
                        style={{ backgroundColor: `${selectedVehicle.color}20` }}
                      >
                        {selectedVehicle.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{selectedVehicle.name}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-400">
                          {[selectedVehicle.brand, selectedVehicle.model].filter(Boolean).join(' ')
                            || vehicleCategoryItems.find((category) => category.id === selectedVehicle.category)?.label
                            || navText('Метка навигатора', 'Navigator marker', languageCode)}
                        </p>
                      </div>
                      <Check className="h-4 w-4 shrink-0 text-blue-200" />
                    </div>
                  </SectionBlock>

                  <SectionBlock title={navText('Категория метки', 'Marker category', languageCode)}>
                    <div className="grid grid-cols-3 gap-2">
                      {vehicleCategoryItems.map((category) => {
                        const count = vehicleMarkers.filter((vehicle) => vehicle.category === category.id).length;
                        const active = vehicleCategory === category.id;
                        return (
                          <button
                            key={category.id}
                            onClick={() => setVehicleCategory(category.id)}
                            className={cn(
                              'rounded-2xl border px-2 py-2 text-center transition-colors',
                              active
                                ? 'border-blue-400/30 bg-blue-500/15 text-blue-100'
                                : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10',
                            )}
                          >
                            <p className="text-xs font-medium">{category.label}</p>
                            <p className="mt-1 text-[10px] text-gray-500">{count}</p>
                          </button>
                        );
                      })}
                    </div>
                  </SectionBlock>

                  <SectionBlock title={navText('Выбор метки', 'Choose marker', languageCode)}>
                    <div className="space-y-2">
                      {filteredVehicles.map((vehicle) => (
                        <button
                          key={vehicle.id}
                          onClick={() => settings.setSelectedVehicle(vehicle.id)}
                          className={cn(
                            'flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                            settings.selectedVehicle === vehicle.id
                              ? 'border-blue-400/30 bg-blue-500/15 text-blue-100'
                              : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10',
                          )}
                        >
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-2xl"
                            style={{ backgroundColor: `${vehicle.color}20` }}
                          >
                            <span className="leading-none">{vehicle.emoji}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{vehicle.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || navText('Стандартная метка', 'Standard marker', languageCode)}
                            </p>
                          </div>
                          {settings.selectedVehicle === vehicle.id && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </SectionBlock>
                </>
              )}
            </div>
          </ScrollArea>

          <div className="order-2 border-l border-white/10 p-2">
            <div className="space-y-1.5">
              {sectionItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'flex w-full flex-row-reverse items-center justify-between gap-2 rounded-2xl px-2.5 py-2.5 text-right text-xs font-medium transition-colors',
                      active
                        ? 'bg-blue-500/20 text-blue-100 border border-blue-400/30'
                        : 'border border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{title}</p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function SelectableChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-2xl border px-3 py-2 text-sm transition-colors',
        active
          ? 'border-blue-400/30 bg-blue-500/15 text-blue-100'
          : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10',
      )}
    >
      {label}
    </button>
  );
}