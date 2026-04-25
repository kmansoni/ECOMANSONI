import type { LatLng } from './taxi';

// === Дорожная инфраструктура (HD) ===

export type LaneMarkingType =
  | 'solid_white'
  | 'solid_double_white'
  | 'solid_yellow'
  | 'solid_double_yellow'
  | 'dashed_white'
  | 'dashed_yellow'
  | 'dashed_long'
  | 'stop_line'
  | 'crosswalk'
  | 'mixed_left_solid'  // солидная слева, прерывистая справа
  | 'mixed_right_solid';

export type LaneType = 'driving' | 'bus' | 'bike' | 'parking' | 'shoulder' | 'reversible';

export type LaneTurnDirection =
  | 'left' | 'slight_left' | 'sharp_left'
  | 'through'
  | 'right' | 'slight_right' | 'sharp_right'
  | 'merge_to_left' | 'merge_to_right'
  | 'reverse';

/** HD-полоса с полной геометрией */
export interface HDLane {
  id: string;
  /** Индекс полосы слева направо (0-based) */
  index: number;
  type: LaneType;
  widthMeters: number;
  /** Осевая линия полосы (после интерполяции/сглаживания) */
  centerline: LatLng[];
  /** Левый край полосы */
  leftEdge: LatLng[];
  /** Правый край полосы */
  rightEdge: LatLng[];
  allowedTurns: LaneTurnDirection[];
  isReversible: boolean;
  /** Можно ли перестроиться влево / вправо (по теге change:lanes) */
  canChangeLeft: boolean;
  canChangeRight: boolean;
  /** Назначение из traffic_sign:5.15.1, если связан */
  destinationHint?: string | null;
}

export interface LaneMarking {
  /** Между полосами index-1 и index. Для крайних — между обочиной и крайней */
  betweenIndices: [number, number];
  type: LaneMarkingType;
  /** Полилиния геометрии разметки */
  geometry: LatLng[];
  /** Цвет для рендера (override default) */
  color?: string;
}

export type SignCategory =
  | 'warning'        // 1.x
  | 'priority'       // 2.x
  | 'prohibitory'    // 3.x
  | 'mandatory'      // 4.x
  | 'special'        // 5.x
  | 'information'    // 6.x
  | 'service'        // 7.x
  | 'additional';    // 8.x

export type SignTimeActivity =
  | { kind: 'always' }
  | { kind: 'schedule'; openingHours: string }
  | { kind: 'night' }
  | { kind: 'temporary'; until?: string };

/** Дорожный знак (RU ГОСТ Р 52290 / Vienna Convention) */
export interface RoadSign {
  id: string;
  /** OSM-тег: например "RU:3.24" */
  tag: string;
  category: SignCategory;
  location: LatLng;
  /** Высота столба над землёй, м (default 2.5) */
  poleHeightM: number;
  /** Направление "взгляда" знака (degrees) */
  facingDirection: number | null;
  /** Доп. значение из тегов (maxspeed, weight) */
  value?: string | number | null;
  /** К каким полосам относится; null = вся проезжая часть */
  appliesToLaneIndices: number[] | null;
  activity: SignTimeActivity;
  /** Подпись (доп. знак прикреплён под основным) */
  additional?: { tag: string; value?: string }[];
}

export type CameraEnforcementType =
  | 'maxspeed'
  | 'average_speed'
  | 'red_signal'
  | 'check'
  | 'toll'
  | 'access_restriction';

export type CameraType = 'fixed' | 'mobile' | 'dome' | 'section';

/** Дорожная камера с FOV */
export interface RoadCamera {
  id: string;
  location: LatLng;
  enforcement: CameraEnforcementType;
  type: CameraType;
  /** Контролируемое ограничение скорости (для maxspeed) */
  maxspeed?: number;
  /** Направление взгляда (degrees, 0 = север) */
  direction: number;
  /** Угол обзора (degrees, default 30 для скорости) */
  fovDegrees: number;
  /** Дальность зрения (m, default 50) */
  rangeMeters: number;
  /** Высота установки (m, default 5) */
  heightMeters: number;
  /** Привязка к полосам, null = все */
  appliesToLaneIndices: number[] | null;
  /** Конец секции для average_speed */
  pairedCameraId?: string;
}

export type BridgeType = 'bridge' | 'viaduct' | 'aqueduct' | 'suspension' | 'arch' | 'cable_stayed';
export type TunnelType = 'tunnel' | 'building_passage' | 'culvert';

/** Мост / эстакада с elevation */
export interface BridgeGeometry {
  id: string;
  bridgeType: BridgeType;
  /** Полилиния полотна моста */
  geometry: LatLng[];
  /** Слой относительно земли (-2..+2, OSM layer тег) */
  layer: number;
  /** Абсолютная высота полотна (m) */
  heightM: number;
  /** Клиренс под мостом (m) */
  clearanceM?: number;
  /** Длина (m) */
  lengthM: number;
}

export interface TunnelGeometry {
  id: string;
  tunnelType: TunnelType;
  geometry: LatLng[];
  layer: number;
  /** Высота прохода (m) */
  heightM?: number;
  lengthM: number;
}

/** Светофор */
export interface TrafficSignal {
  id: string;
  location: LatLng;
  /** На какое направление действует */
  direction: 'forward' | 'backward' | 'both';
  /** Есть ли таймер обратного отсчёта */
  hasCountdown: boolean;
  /** Цикл фаз (если известно): красный/жёлтый/зелёный в секундах */
  cycle?: { red: number; yellow: number; green: number };
}

/** Ограничения дороги */
export interface RoadRestriction {
  /** Тип ограничения */
  kind: 'maxweight' | 'maxheight' | 'maxwidth' | 'maxlength' | 'maxaxleload';
  /** Значение в SI (кг или м) */
  value: number;
  /** Применимо к сегменту */
  edgeId: string;
}

/** BBox для запросов */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Полный снимок инфраструктуры в bbox */
export interface RoadInfraSnapshot {
  bbox: BBox;
  fetchedAt: number;
  ttlSeconds: number;
  source: 'overpass' | 'cache' | 'offline' | 'supabase';
  lanes: HDLane[];
  markings: LaneMarking[];
  signs: RoadSign[];
  cameras: RoadCamera[];
  signals: TrafficSignal[];
  bridges: BridgeGeometry[];
  tunnels: TunnelGeometry[];
  restrictions: RoadRestriction[];
  speedBumps: SpeedBump[];
  crossings: PedestrianCrossing[];
  borders: BorderCrossing[];
  checkpoints: PoliceCheckpoint[];
  parking: ParkingArea[];
  roundabouts: Roundabout[];
  exits: HighwayExit[];
  surfaces: RoadSurface[];
}

/** Опции сканирования */
export interface InfraScanOptions {
  includeLanes?: boolean;
  includeSigns?: boolean;
  includeCameras?: boolean;
  includeBridges?: boolean;
  includeSignals?: boolean;
  includeSpeedBumps?: boolean;
  includeCrossings?: boolean;
  includeBorders?: boolean;
  includeCheckpoints?: boolean;
  includeParking?: boolean;
  includeRoundabouts?: boolean;
  includeExits?: boolean;
  includeSurfaces?: boolean;
  cacheTTL?: number;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

/** Результат для 3D-рендера (после lane-modeler) */
export interface RenderableLaneSet {
  lanes: HDLane[];
  markings: LaneMarking[];
  /** Стрелки направлений на разметке */
  arrows: LaneArrow[];
}

export interface LaneArrow {
  /** Точка на полосе где рисуется стрелка */
  position: LatLng;
  /** Направление стрелки */
  direction: LaneTurnDirection;
  /** К какой полосе относится */
  laneIndex: number;
  /** Поворот относительно направления полосы (degrees) */
  rotationDeg: number;
}

// === Расширенная дорожная инфраструктура ===

export type SpeedBumpType = 'bump' | 'hump' | 'table' | 'cushion' | 'raised_crosswalk' | 'dip';

export interface SpeedBump {
  id: string;
  location: LatLng;
  bumpType: SpeedBumpType;
  /** Связан с пешеходным переходом (raised_crosswalk) */
  crossingRef?: string;
}

export type CrossingType = 'uncontrolled' | 'traffic_signals' | 'zebra' | 'pelican' | 'toucan' | 'underpass' | 'overpass';

export interface PedestrianCrossing {
  id: string;
  location: LatLng;
  crossingType: CrossingType;
  hasSignal: boolean;
  hasTactilePaving: boolean;
  /** Геометрия (way-based переходы) */
  geometry?: LatLng[];
}

export type BorderType = 'international' | 'regional' | 'checkpoint';

export interface BorderCrossing {
  id: string;
  location: LatLng;
  borderType: BorderType;
  name: string;
  /** Часы работы (OSM opening_hours) */
  openingHours?: string;
  /** Для международных: код страны по ту сторону */
  countryTo?: string;
}

export type CheckpointType = 'dps' | 'weight_control' | 'customs' | 'toll_booth';

export interface PoliceCheckpoint {
  id: string;
  location: LatLng;
  checkpointType: CheckpointType;
  name?: string;
  /** Направление контроля (degrees) */
  direction?: number;
}

export type ParkingType = 'surface' | 'underground' | 'multi_storey' | 'rooftop' | 'street_side' | 'lane';

export interface ParkingArea {
  id: string;
  location: LatLng;
  parkingType: ParkingType;
  capacity?: number;
  fee: boolean;
  /** OSM access-тег: yes / customers / private */
  access: 'yes' | 'customers' | 'private' | 'permissive';
  geometry?: LatLng[];
  name?: string;
}

export interface Roundabout {
  id: string;
  center: LatLng;
  /** Примерный радиус, м */
  radiusM: number;
  lanes: number;
  /** Направление движения */
  direction: 'clockwise' | 'counterclockwise';
  geometry: LatLng[];
}

export interface HighwayExit {
  id: string;
  location: LatLng;
  /** Номер съезда */
  ref?: string;
  /** Куда ведёт */
  destination?: string;
  exitType: 'exit' | 'entry' | 'rest_area' | 'service_area';
}

export type SmoothnessGrade = 'excellent' | 'good' | 'intermediate' | 'bad' | 'very_bad' | 'horrible';

export interface RoadSurface {
  edgeId: string;
  surface: string;
  smoothness: SmoothnessGrade;
  /** Дата последнего survey (ISO string) */
  lastSurvey?: string;
  geometry: LatLng[];
}
