import type { LatLng } from './taxi';

export type NavigationPhase = 'idle' | 'search' | 'route_preview' | 'navigating' | 'arrived';

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
  speedLimit: number | null;
  nearbyCamera: SpeedCamera | null;
  voiceEnabled: boolean;
  isNorthUp: boolean;
  favorites: SavedPlace[];
  recents: SavedPlace[];
}
