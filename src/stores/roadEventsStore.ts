/**
 * roadEventsStore — Zustand store for user-reported road events.
 * Events are stored locally and synced to Supabase when online.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLng } from '@/types/taxi';
import { navText } from '@/lib/navigation/navigationUi';

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

interface RoadEventInfo {
  label: string;
  emoji: string;
  duration: number;
}

interface RoadEventDefinition {
  labelRu: string;
  labelEn: string;
  emoji: string;
  duration: number;
}

const ROAD_EVENT_DEFINITIONS: Record<RoadEventType, RoadEventDefinition> = {
  accident:      { labelRu: 'ДТП', labelEn: 'Accident', emoji: '🚨', duration: 2 * 60 * 60 * 1000 },
  police:        { labelRu: 'Пост ДПС', labelEn: 'Police checkpoint', emoji: '👮', duration: 4 * 60 * 60 * 1000 },
  road_works:    { labelRu: 'Дорожные работы', labelEn: 'Road works', emoji: '🚧', duration: 24 * 60 * 60 * 1000 },
  traffic_jam:   { labelRu: 'Пробка', labelEn: 'Traffic jam', emoji: '🚗', duration: 1 * 60 * 60 * 1000 },
  hazard:        { labelRu: 'Опасность', labelEn: 'Hazard', emoji: '⚠️', duration: 6 * 60 * 60 * 1000 },
  speed_camera:  { labelRu: 'Камера', labelEn: 'Speed camera', emoji: '📸', duration: 30 * 24 * 60 * 60 * 1000 },
  pothole:       { labelRu: 'Яма', labelEn: 'Pothole', emoji: '🕳️', duration: 7 * 24 * 60 * 60 * 1000 },
  fog:           { labelRu: 'Туман', labelEn: 'Fog', emoji: '🌫️', duration: 4 * 60 * 60 * 1000 },
  ice:           { labelRu: 'Гололёд', labelEn: 'Ice', emoji: '🧊', duration: 12 * 60 * 60 * 1000 },
  flood:         { labelRu: 'Затопление', labelEn: 'Flooding', emoji: '🌊', duration: 12 * 60 * 60 * 1000 },
  closed_road:   { labelRu: 'Дорога закрыта', labelEn: 'Road closed', emoji: '🚫', duration: 24 * 60 * 60 * 1000 },
  detour:        { labelRu: 'Объезд', labelEn: 'Detour', emoji: '↩️', duration: 24 * 60 * 60 * 1000 },
  fuel_price:    { labelRu: 'Цена бензина', labelEn: 'Fuel price', emoji: '⛽', duration: 7 * 24 * 60 * 60 * 1000 },
  other:         { labelRu: 'Другое', labelEn: 'Other', emoji: '📌', duration: 2 * 60 * 60 * 1000 },
};

export const ROAD_EVENT_LABELS: Record<RoadEventType, RoadEventInfo> = Object.fromEntries(
  Object.entries(ROAD_EVENT_DEFINITIONS).map(([type, info]) => [type, { label: info.labelEn, emoji: info.emoji, duration: info.duration }]),
) as Record<RoadEventType, RoadEventInfo>;

export function getRoadEventLabels(languageCode?: string | null): Record<RoadEventType, RoadEventInfo> {
  return Object.fromEntries(
    Object.entries(ROAD_EVENT_DEFINITIONS).map(([type, info]) => [
      type,
      {
        label: navText(info.labelRu, info.labelEn, languageCode),
        emoji: info.emoji,
        duration: info.duration,
      },
    ]),
  ) as Record<RoadEventType, RoadEventInfo>;
}

export function getRoadEventInfo(type: RoadEventType, languageCode?: string | null): RoadEventInfo {
  return getRoadEventLabels(languageCode)[type];
}

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
