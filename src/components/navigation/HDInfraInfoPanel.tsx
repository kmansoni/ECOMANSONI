/**
 * HDInfraInfoPanel — попап с информацией о выбранном объекте инфраструктуры
 * (знак, камера, мост).
 *
 * Открывается по клику на 3D-объект (через raycast в HDRoadSceneOrchestrator).
 */

import { X, Camera, AlertTriangle as SignIcon, Construction, ShieldAlert, ParkingSquare, CircleDot, LogOut, Footprints, Milestone } from 'lucide-react';
import type { RoadCamera, RoadSign, BridgeGeometry, SpeedBump, PedestrianCrossing, BorderCrossing, PoliceCheckpoint, ParkingArea, Roundabout, HighwayExit } from '@/types/roadInfra';
import { getSignTitle } from '@/lib/navigation/infra';

type SelectedObject =
  | { kind: 'sign'; data: RoadSign }
  | { kind: 'camera'; data: RoadCamera }
  | { kind: 'bridge'; data: BridgeGeometry }
  | { kind: 'speed_bump'; data: SpeedBump }
  | { kind: 'crossing'; data: PedestrianCrossing }
  | { kind: 'border'; data: BorderCrossing }
  | { kind: 'checkpoint'; data: PoliceCheckpoint }
  | { kind: 'parking'; data: ParkingArea }
  | { kind: 'roundabout'; data: Roundabout }
  | { kind: 'exit'; data: HighwayExit };

interface HDInfraInfoPanelProps {
  object: SelectedObject | null;
  onClose: () => void;
}

const ENFORCEMENT_LABELS: Record<RoadCamera['enforcement'], string> = {
  maxspeed: 'Контроль скорости',
  average_speed: 'Средняя скорость',
  red_signal: 'Проезд на красный',
  check: 'Проверочная',
  toll: 'Платная дорога',
  access_restriction: 'Ограничение въезда',
};

const BUMP_LABELS: Record<string, string> = {
  bump: 'Лежачий полицейский', hump: 'Искусственная неровность', table: 'Приподнятая платформа',
  cushion: 'Подушка', raised_crosswalk: 'Приподнятый переход', dip: 'Углубление',
};

const CROSSING_LABELS: Record<string, string> = {
  uncontrolled: 'Нерегулируемый', traffic_signals: 'Со светофором', zebra: 'Зебра',
  pelican: 'Пеликан', toucan: 'Тукан', underpass: 'Подземный', overpass: 'Надземный',
};

const CHECKPOINT_LABELS: Record<string, string> = {
  dps: 'Пост ДПС', weight_control: 'Весовой контроль', customs: 'Таможня', toll_booth: 'Пункт оплаты',
};

const PARKING_LABELS: Record<string, string> = {
  surface: 'Открытая', underground: 'Подземная', multi_storey: 'Многоэтажная',
  rooftop: 'На крыше', street_side: 'У обочины', lane: 'На полосе',
};

export function HDInfraInfoPanel({ object, onClose }: HDInfraInfoPanelProps) {
  if (!object) return null;

  const iconMap: Record<string, JSX.Element> = {
    sign: <SignIcon className="h-5 w-5 text-blue-600" />,
    camera: <Camera className="h-5 w-5 text-orange-600" />,
    bridge: <Construction className="h-5 w-5 text-emerald-600" />,
    speed_bump: <Milestone className="h-5 w-5 text-yellow-500" />,
    crossing: <Footprints className="h-5 w-5 text-blue-400" />,
    border: <ShieldAlert className="h-5 w-5 text-red-600" />,
    checkpoint: <ShieldAlert className="h-5 w-5 text-blue-600" />,
    parking: <ParkingSquare className="h-5 w-5 text-cyan-500" />,
    roundabout: <CircleDot className="h-5 w-5 text-violet-500" />,
    exit: <LogOut className="h-5 w-5 text-green-500" />,
  };

  function getTitle(): string {
    if (!object) return '';
    switch (object.kind) {
      case 'sign': return getSignTitle(object.data.tag);
      case 'camera': return ENFORCEMENT_LABELS[object.data.enforcement];
      case 'bridge': return capitalize(object.data.bridgeType);
      case 'speed_bump': return BUMP_LABELS[object.data.bumpType] ?? 'Неровность';
      case 'crossing': return CROSSING_LABELS[object.data.crossingType] ?? 'Переход';
      case 'border': return object.data.name;
      case 'checkpoint': return CHECKPOINT_LABELS[object.data.checkpointType] ?? 'Пост';
      case 'parking': return object.data.name ?? PARKING_LABELS[object.data.parkingType] ?? 'Парковка';
      case 'roundabout': return `Кольцо (${object.data.lanes} пол.)`;
      case 'exit': return object.data.ref ? `Съезд ${object.data.ref}` : 'Съезд';
    }
  }

  return (
    <div className="absolute right-3 top-3 z-30 max-w-xs rounded-xl bg-white/95 p-4 shadow-xl backdrop-blur dark:bg-slate-800/95 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {iconMap[object.kind]}
          <h3 className="font-semibold">{getTitle()}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        {object.kind === 'sign' && (
          <>
            <Row label="Тег OSM" value={object.data.tag} />
            <Row label="Категория" value={object.data.category} />
            {object.data.value != null && (
              <Row label="Значение" value={String(object.data.value)} />
            )}
            {object.data.facingDirection != null && (
              <Row label="Направление" value={`${Math.round(object.data.facingDirection)}°`} />
            )}
          </>
        )}

        {object.kind === 'camera' && (
          <>
            <Row label="Тип" value={object.data.type} />
            {object.data.maxspeed != null && (
              <Row label="Лимит скорости" value={`${object.data.maxspeed} км/ч`} />
            )}
            <Row label="Дальность" value={`${object.data.rangeMeters} м`} />
            <Row label="Угол обзора" value={`${object.data.fovDegrees}°`} />
            <Row label="Высота" value={`${object.data.heightMeters} м`} />
          </>
        )}

        {object.kind === 'bridge' && (
          <>
            <Row label="Длина" value={`${Math.round(object.data.lengthM)} м`} />
            <Row label="Высота" value={`${object.data.heightM.toFixed(1)} м`} />
            <Row label="Слой" value={String(object.data.layer)} />
            {object.data.clearanceM != null && (
              <Row label="Клиренс" value={`${object.data.clearanceM} м`} />
            )}
          </>
        )}

        {object.kind === 'speed_bump' && (
          <Row label="Тип" value={BUMP_LABELS[object.data.bumpType] ?? object.data.bumpType} />
        )}

        {object.kind === 'crossing' && (
          <>
            <Row label="Тип" value={CROSSING_LABELS[object.data.crossingType] ?? object.data.crossingType} />
            <Row label="Светофор" value={object.data.hasSignal ? 'Да' : 'Нет'} />
            <Row label="Тактильная плитка" value={object.data.hasTactilePaving ? 'Да' : 'Нет'} />
          </>
        )}

        {object.kind === 'border' && (
          <>
            <Row label="Тип" value={object.data.borderType === 'international' ? 'Международная' : 'Региональная'} />
            {object.data.openingHours && <Row label="Часы работы" value={object.data.openingHours} />}
            {object.data.countryTo && <Row label="Страна" value={object.data.countryTo} />}
          </>
        )}

        {object.kind === 'checkpoint' && (
          <>
            <Row label="Тип" value={CHECKPOINT_LABELS[object.data.checkpointType] ?? object.data.checkpointType} />
            {object.data.name && <Row label="Название" value={object.data.name} />}
          </>
        )}

        {object.kind === 'parking' && (
          <>
            <Row label="Тип" value={PARKING_LABELS[object.data.parkingType] ?? object.data.parkingType} />
            {object.data.capacity != null && <Row label="Вместимость" value={`${object.data.capacity} мест`} />}
            <Row label="Оплата" value={object.data.fee ? 'Платная' : 'Бесплатная'} />
            <Row label="Доступ" value={object.data.access} />
          </>
        )}

        {object.kind === 'roundabout' && (
          <>
            <Row label="Радиус" value={`${Math.round(object.data.radiusM)} м`} />
            <Row label="Полос" value={String(object.data.lanes)} />
          </>
        )}

        {object.kind === 'exit' && (
          <>
            {object.data.ref && <Row label="Номер" value={object.data.ref} />}
            {object.data.destination && <Row label="Направление" value={object.data.destination} />}
            <Row label="Тип" value={object.data.exitType === 'rest_area' ? 'Зона отдыха' : object.data.exitType === 'service_area' ? 'АЗС / сервис' : 'Съезд'} />
          </>
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
