/**
 * roadEventsStore — Zustand store for user-reported road events.
 * Events are stored locally and synced to Supabase when online.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLng } from '@/types/taxi';

export type RoadEventType =
  | 'accident'           // ДТП
  | 'police'             // Пост ДПС
  | 'road_works'         // Дорожные работы
  | 'traffic_jam'        // Пробка
  | 'hazard'             // Опасность на дороге
  | 'speed_camera'       // Камера
  | 'pothole'            // Яма
  | 'fog'                // Туман
  | 'ice'                // Гололёд
  | 'flood'              // Затопление
  | 'closed_road'        // Дорога закрыта
  | 'detour'             // Объезд
  | 'fuel_price'         // Цена бензина
  | 'other';             // Другое

export interface RoadEvent {
  id: string;
  type: RoadEventType;
  location: LatLng;
  description: string;
  reportedBy: string; // user id
  reportedAt: number; // timestamp ms
  expiresAt: number;  // timestamp ms
  upvotes: number;
  downvotes: number;
  verified: boolean;
  photoUrl?: string;
}

export const ROAD_EVENT_LABELS: Record<RoadEventType, { label: string; emoji: string; duration: number }> = {
  accident:      { label: 'ДТП', emoji: '🚨', duration: 2 * 60 * 60 * 1000 },
  police:        { label: 'Пост ДПС', emoji: '👮', duration: 4 * 60 * 60 * 1000 },
  road_works:    { label: 'Дорожные работы', emoji: '🚧', duration: 24 * 60 * 60 * 1000 },
  traffic_jam:   { label: 'Пробка', emoji: '🚗', duration: 1 * 60 * 60 * 1000 },
  hazard:        { label: 'Опасность', emoji: '⚠️', duration: 6 * 60 * 60 * 1000 },
  speed_camera:  { label: 'Камера', emoji: '📸', duration: 30 * 24 * 60 * 60 * 1000 },
  pothole:       { label: 'Яма', emoji: '🕳️', duration: 7 * 24 * 60 * 60 * 1000 },
  fog:           { label: 'Туман', emoji: '🌫️', duration: 4 * 60 * 60 * 1000 },
  ice:           { label: 'Гололёд', emoji: '🧊', duration: 12 * 60 * 60 * 1000 },
  flood:         { label: 'Затопление', emoji: '🌊', duration: 12 * 60 * 60 * 1000 },
  closed_road:   { label: 'Дорога закрыта', emoji: '🚫', duration: 24 * 60 * 60 * 1000 },
  detour:        { label: 'Объезд', emoji: '↩️', duration: 24 * 60 * 60 * 1000 },
  fuel_price:    { label: 'Цена бензина', emoji: '⛽', duration: 7 * 24 * 60 * 60 * 1000 },
  other:         { label: 'Другое', emoji: '📌', duration: 2 * 60 * 60 * 1000 },
};

interface RoadEventsState {
  events: RoadEvent[];
  myReports: RoadEvent[];
  addEvent: (event: RoadEvent) => void;
  removeEvent: (id: string) => void;
  upvoteEvent: (id: string) => void;
  downvoteEvent: (id: string) => void;
  clearExpired: () => void;
  getEventsNear: (location: LatLng, radiusKm: number) => RoadEvent[];
}

export const useRoadEvents = create<RoadEventsState>()(
  persist(
    (set, get) => ({
      events: [],
      myReports: [],

      addEvent: (event) => set((s) => ({
        events: [event, ...s.events],
        myReports: [event, ...s.myReports],
      })),

      removeEvent: (id) => set((s) => ({
        events: s.events.filter(e => e.id !== id),
        myReports: s.myReports.filter(e => e.id !== id),
      })),

      upvoteEvent: (id) => set((s) => ({
        events: s.events.map(e => e.id === id ? { ...e, upvotes: e.upvotes + 1 } : e),
      })),

      downvoteEvent: (id) => set((s) => ({
        events: s.events.map(e => e.id === id ? { ...e, downvotes: e.downvotes + 1 } : e),
      })),

      clearExpired: () => {
        const now = Date.now();
        set((s) => ({
          events: s.events.filter(e => e.expiresAt > now),
        }));
      },

      getEventsNear: (location, radiusKm) => {
        const events = get().events;
        const now = Date.now();
        return events.filter(e => {
          if (e.expiresAt <= now) return false;
          const dlat = e.location.lat - location.lat;
          const dlng = e.location.lng - location.lng;
          const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111; // rough km
          return dist <= radiusKm;
        });
      },
    }),
    { name: 'road-events' },
  ),
);
