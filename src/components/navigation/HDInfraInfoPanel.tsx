/**
 * HDInfraInfoPanel — попап с информацией о выбранном объекте инфраструктуры
 * (знак, камера, мост).
 *
 * Открывается по клику на 3D-объект (через raycast в HDRoadSceneOrchestrator).
 */

import { X, Camera, AlertTriangle as SignIcon, Construction } from 'lucide-react';
import type { RoadCamera, RoadSign, BridgeGeometry } from '@/types/roadInfra';
import { getSignTitle } from '@/lib/navigation/infra';

type SelectedObject =
  | { kind: 'sign'; data: RoadSign }
  | { kind: 'camera'; data: RoadCamera }
  | { kind: 'bridge'; data: BridgeGeometry };

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

export function HDInfraInfoPanel({ object, onClose }: HDInfraInfoPanelProps) {
  if (!object) return null;

  return (
    <div className="absolute right-3 top-3 z-30 max-w-xs rounded-xl bg-white/95 p-4 shadow-xl backdrop-blur dark:bg-slate-800/95 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {object.kind === 'sign' && <SignIcon className="h-5 w-5 text-blue-600" />}
          {object.kind === 'camera' && <Camera className="h-5 w-5 text-orange-600" />}
          {object.kind === 'bridge' && <Construction className="h-5 w-5 text-emerald-600" />}
          <h3 className="font-semibold">
            {object.kind === 'sign' && getSignTitle(object.data.tag)}
            {object.kind === 'camera' && ENFORCEMENT_LABELS[object.data.enforcement]}
            {object.kind === 'bridge' && capitalize(object.data.bridgeType)}
          </h3>
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
