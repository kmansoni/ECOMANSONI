/**
 * navigatorSettingsSync.ts — Supabase sync layer for navigator settings.
 * Bridges the Zustand localStorage store with server-side persistence.
 *
 * Strategy:
 * - On login: hydrate localStorage from Supabase (server wins on conflict)
 * - On change: debounced upsert to Supabase (optimistic local, async remote)
 * - On logout: keep localStorage for offline use
 */
import { supabase } from '@/integrations/supabase/client';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import type { SoundMode, VoiceId, MapViewMode, NavTheme } from '@/stores/navigatorSettingsStore';

// Debounce timer for batching rapid changes
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500;

interface NavigatorSettingsRow {
  user_id: string;
  sound_mode: SoundMode;
  volume: number;
  mute_other_apps: boolean;
  selected_voice: VoiceId;
  voice_enabled: boolean;
  avoid_tolls: boolean;
  avoid_unpaved: boolean;
  avoid_highways: boolean;
  selected_vehicle: string;
  map_view_mode: MapViewMode;
  nav_theme: NavTheme;
  show_3d_buildings: boolean;
  show_traffic_lights: boolean;
  show_speed_bumps: boolean;
  show_road_signs: boolean;
  show_lanes: boolean;
  show_speed_cameras: boolean;
  show_poi: boolean;
  show_panorama: boolean;
  label_size_multiplier: number;
  high_contrast_labels: boolean;
  updated_at: string;
}

/** Convert DB row → Zustand state shape */
function rowToState(row: NavigatorSettingsRow) {
  return {
    soundMode: row.sound_mode,
    volume: row.volume,
    muteOtherApps: row.mute_other_apps,
    selectedVoice: row.selected_voice,
    voiceEnabled: row.voice_enabled,
    avoidTolls: row.avoid_tolls,
    avoidUnpaved: row.avoid_unpaved,
    avoidHighways: row.avoid_highways,
    selectedVehicle: row.selected_vehicle,
    mapViewMode: row.map_view_mode,
    navTheme: row.nav_theme,
    show3DBuildings: row.show_3d_buildings,
    showTrafficLights: row.show_traffic_lights,
    showSpeedBumps: row.show_speed_bumps,
    showRoadSigns: row.show_road_signs,
    showLanes: row.show_lanes,
    showSpeedCameras: row.show_speed_cameras,
    showPOI: row.show_poi,
    showPanorama: row.show_panorama,
    labelSizeMultiplier: row.label_size_multiplier,
    highContrastLabels: row.high_contrast_labels,
  };
}

/** Convert Zustand state → DB JSONB payload */
function stateToPayload() {
  const s = useNavigatorSettings.getState();
  return {
    sound_mode: s.soundMode,
    volume: s.volume,
    mute_other_apps: s.muteOtherApps,
    selected_voice: s.selectedVoice,
    voice_enabled: s.voiceEnabled,
    avoid_tolls: s.avoidTolls,
    avoid_unpaved: s.avoidUnpaved,
    avoid_highways: s.avoidHighways,
    selected_vehicle: s.selectedVehicle,
    map_view_mode: s.mapViewMode,
    nav_theme: s.navTheme,
    show_3d_buildings: s.show3DBuildings,
    show_traffic_lights: s.showTrafficLights,
    show_speed_bumps: s.showSpeedBumps,
    show_road_signs: s.showRoadSigns,
    show_lanes: s.showLanes,
    show_speed_cameras: s.showSpeedCameras,
    show_poi: s.showPOI,
    show_panorama: s.showPanorama,
    label_size_multiplier: s.labelSizeMultiplier,
    high_contrast_labels: s.highContrastLabels,
  };
}

/**
 * Hydrate local store from Supabase. Server wins on conflict.
 * Call on login / app mount when authenticated.
 */
export async function hydrateNavigatorSettings(userId: string): Promise<void> {
  try {
    const { data, error } = await (supabase as any)
      .from('navigator_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[navigatorSettingsSync] hydrate failed:', error.message);
      return;
    }

    if (data) {
      const state = rowToState(data as NavigatorSettingsRow);
      useNavigatorSettings.setState(state);
    } else {
      // No server row yet — push local state to server
      await pushNavigatorSettings(userId);
    }
  } catch (err) {
    console.warn('[navigatorSettingsSync] hydrate error:', err);
  }
}

/**
 * Push current local state to Supabase (immediate, no debounce).
 */
export async function pushNavigatorSettings(userId: string): Promise<void> {
  try {
    const payload = stateToPayload();
    const { error } = await (supabase as any).rpc('upsert_navigator_settings', {
      p_user_id: userId,
      p_settings: payload,
    });
    if (error) {
      console.warn('[navigatorSettingsSync] push failed:', error.message);
    }
  } catch (err) {
    console.warn('[navigatorSettingsSync] push error:', err);
  }
}

/**
 * Schedule a debounced sync to Supabase.
 * Call this from the Zustand store subscribe callback.
 */
export function scheduleSyncToServer(userId: string): void {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    void pushNavigatorSettings(userId);
    _syncTimer = null;
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Subscribe to store changes and auto-sync to Supabase.
 * Returns an unsubscribe function.
 */
export function startNavigatorSettingsSync(userId: string): () => void {
  // Initial hydration
  void hydrateNavigatorSettings(userId);

  // Subscribe to all state changes
  const unsub = useNavigatorSettings.subscribe(() => {
    scheduleSyncToServer(userId);
  });

  return () => {
    unsub();
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
    }
  };
}
