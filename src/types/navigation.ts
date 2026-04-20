import type { LatLng, VehicleClass } from './taxi';

export type NavigationPhase = 'idle' | 'search' | 'route_preview' | 'navigating' | 'arrived';

// === Мультимодальный навигатор ===

export type TravelMode = 'car' | 'taxi' | 'pedestrian' | 'transit' | 'metro' | 'multimodal';

export type TransitType = 'bus' | 'trolleybus' | 'tram' | 'metro' | 'suburban' | 'ferry' | 'cable_car';

export interface TransitMode {
  type: TransitType;
  agencyId?: string;
}

export interface TransitStop {
  id: string;
  stopId: string;
  name: string;
  location: LatLng;
  locationType: number; // 0=stop, 1=station
  wheelchairBoarding?: boolean;
  city: string;
}

export interface TransitTrip {
  id: string;
  routeId: string;
  routeName: string;
  routeType: TransitType;
  routeColor?: string;
  agencyName?: string;
  headsign: string;
  stops: TransitStop[];
  duration: number;     // seconds
  distance: number;     // meters
  schedule: Record<string, unknown>;
  predictedArrivals: Array<{
    stopId: string;
    arrival: Date;
    delaySeconds: number;
    confidence: number;
  }>;
  vehiclePosition?: {
    lat: number;
    lng: number;
    bearing: number;
    speedKmh: number;
  };
  congestionLevel?: 'low' | 'medium' | 'high' | 'severe';
}

export interface MultiModalSegment {
  mode: 'walk' | 'transit' | 'car';
  from: LatLng;
  to: LatLng;
  distanceMeters: number;
  durationSeconds: number;
  geometry?: LatLng[];
  // transit segment:
  trip?: TransitTrip;
  fromStop?: TransitStop;
  toStop?: TransitStop;
  // car/taxi segment:
  route?: NavRoute;
  taxiEstimate?: TaxiEstimate;
}

export interface MultiModalRoute {
  id: string;
  travelMode: TravelMode;
  segments: MultiModalSegment[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  fare?: number;
  transfers: number;
  accessibilityScore: number;
  ecoScore: number;
  description: string;
}

export interface TaxiEstimate {
  provider: 'yandex' | 'citymobil' | 'uber';
  priceRub: number;
  durationMinutes: number;
  distanceKm: number;
  carClass: VehicleClass;
  surgeMultiplier: number;
  etaMinutes: number;
}

export interface RealTimeVehicle {
  tripId: string;
  vehicleId: string;
  position: LatLng;
  bearing: number;
  speedKmh: number;
  timestamp: Date;
  delaySeconds: number;
  routeColor?: string;
  routeName?: string;
  congestionLevel?: 'low' | 'medium' | 'high' | 'severe';
}

export interface TransitRoutingOptions {
  modes?: TravelMode[];
  transitTypes?: TransitType[];
  maxTransfers?: number;
  departureTime?: Date;
  arrivalTime?: Date;
  wheelchairAccessible?: boolean;
  minimize?: 'time' | 'transfers' | 'cost' | 'eco';
  includeTaxiAlternatives?: boolean;
  taxiProvider?: 'yandex' | 'citymobil';
}

export interface PedestrianRoutingOptions {
  avoidStairs?: boolean;
  preferElevators?: boolean;
  maxSlopePercent?: number;
}

export type ManeuverType =
  | 'depart'
  | 'arrive'
  | 'turn-left'
  | 'turn-right'
  | 'turn-slight-left'
  | 'turn-slight-right'
  | 'turn-sharp-left'
  | 'turn-sharp-right'
  | 'uturn'
  | 'merge-left'
  | 'merge-right'
  | 'fork-left'
  | 'fork-right'
  | 'roundabout'
  | 'exit-roundabout'
  | 'straight'
  | 'ramp-left'
  | 'ramp-right'
  | 'keep-left'
  | 'keep-right';

export type TrafficLevel = 'free' | 'moderate' | 'slow' | 'congested' | 'unknown';

export type LaneTurn =
  | 'left'
  | 'slight_left'
  | 'sharp_left'
  | 'through'
  | 'right'
  | 'slight_right'
  | 'sharp_right'
  | 'merge_to_left'
  | 'merge_to_right'
  | 'reverse'
  | 'none';

export type GuidanceSeverity = 'info' | 'warn' | 'critical';

export interface NavigationLaneInfo {
  index: number;
  turns: LaneTurn[];
  isRecommended: boolean;
  isBusLane: boolean;
  isBikeLane: boolean;
  destination?: string;
}

export interface NavigationLaneGuidance {
  lanes: NavigationLaneInfo[];
  totalLanes: number;
  distanceToIntersection: number;
  message: string;
  urgency: GuidanceSeverity;
  source: 'osm' | 'heuristic';
  maneuverType: ManeuverType;
  destinationHint?: string | null;
}

export type RouteMapObjectKind = 'traffic_light' | 'speed_bump' | 'road_sign' | 'speed_camera' | 'poi';

export type RouteObjectRelevance = 'low' | 'secondary' | 'primary';

export interface NavigationMapObject {
  id: string;
  kind: RouteMapObjectKind;
  location: LatLng;
  title: string;
  subtitle?: string | null;
  iconText: string;
  relevance: RouteObjectRelevance;
  severity?: GuidanceSeverity;
  routeDistanceMeters?: number | null;
  heading?: number | null;
  metadata?: Record<string, unknown>;
}

export type VehicleMarkerVisualState =
  | 'straight'
  | 'prepare-left'
  | 'left'
  | 'prepare-right'
  | 'right'
  | 'merge'
  | 'ramp'
  | 'arrival';

export interface Maneuver {
  type: ManeuverType;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  location: LatLng;
}

export interface RouteSegment {
  points: LatLng[];
  traffic: TrafficLevel;
  speedLimit: number | null;
}

export interface NavRoute {
  id: string;
  segments: RouteSegment[];
  maneuvers: Maneuver[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  geometry: LatLng[];
}

export interface SpeedCamera {
  id: string;
  location: LatLng;
  speedLimit: number;
  direction: number; // heading in degrees
  type: 'fixed' | 'mobile' | 'average';
}

export interface SavedPlace {
  id: string;
  name: string;
  address: string;
  coordinates: LatLng;
  icon: 'home' | 'work' | 'star' | 'recent';
  /** ФИАС GUID */
  fiasId?: string;
  /** КЛАДР код */
  kladrId?: string;
  /** Почтовый индекс */
  postalCode?: string;
  /** Уровень ФИАС (1-region … 8-house … 9-flat) */
  fiasLevel?: string;
  /** Категория POI (для мест) */
  category?: string;
}

export interface NavigationState {
  phase: NavigationPhase;
  currentPosition: LatLng | null;
  currentHeading: number;
  currentSpeed: number; // km/h
  destination: SavedPlace | null;
  route: NavRoute | null;
  alternativeRoutes: NavRoute[];
  currentManeuverIndex: number;
  nextInstruction: Maneuver | null;
  distanceToNextTurn: number;
  remainingDistance: number;
  remainingTime: number; // seconds
  eta: string; // "HH:MM"
  laneGuidance: NavigationLaneGuidance | null;
  speedLimit: number | null;
  nearbyCamera: SpeedCamera | null;
  voiceEnabled: boolean;
  isNorthUp: boolean;
  favorites: SavedPlace[];
  recents: SavedPlace[];
}
