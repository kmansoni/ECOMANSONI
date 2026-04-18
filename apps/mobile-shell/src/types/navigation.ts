import type { LatLng } from '../types';
import type { NavRoute, Maneuver, ManeuverType } from '../../../src/types/navigation';

export interface NavigationRoute {
  id: string;
  from: LatLng;
  to: LatLng;
  waypoints: LatLng[];
  route: NavRoute | null;
  transportMode: 'car' | 'walk' | 'bike';
  alternatives: NavRoute[];
}

export interface NavigationInstruction {
  type: 'turn' | 'continue' | 'arrive' | 'depart' | 'uturn' | 'roundabout' | 'merge';
  modifier?: 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right';
  text: string;
  distance: number;
  streetName?: string;
}

export interface NavigationState {
  isActive: boolean;
  route: NavRoute | null;
  currentPosition: LatLng | null;
  currentHeading: number;
  currentInstruction: NavigationInstruction | null;
  nextInstruction: NavigationInstruction | null;
  distanceToNext: number;
  remainingDistance: number;
  remainingTime: number;
  eta: Date;
  voiceEnabled: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  address: string;
  position: LatLng;
  type: 'address' | 'poi' | 'favorite' | 'history';
  distance?: number;
  category?: string;
}

export interface SearchCategory {
  id: string;
  name: string;
  icon: string;
  query?: string;
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  { id: 'recent', name: 'Недавние', icon: '🕐' },
  { id: 'home', name: 'Дом', icon: '🏠', query: 'home' },
  { id: 'work', name: 'Работа', icon: '💼', query: 'work' },
  { id: 'food', name: 'Еда', icon: '🍽️', query: 'restaurant' },
  { id: 'gas', name: 'АЗС', icon: '⛽', query: 'fuel' },
  { id: 'parking', name: 'Парковка', icon: '🅿️', query: 'parking' },
  { id: 'shopping', name: 'Магазины', icon: '🛒', query: 'shop' },
];

export interface RoutePoint {
  id: string;
  type: 'start' | 'waypoint' | 'end';
  position: LatLng;
  name?: string;
  address?: string;
}