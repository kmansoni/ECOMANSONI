import { staticDataUrl } from './staticDataUrl';

export interface OfflineConfig {
  enabled: boolean;
  tileBasePath: string;
  graphPath: string;
  poisPath: string;
  cacheTiles: boolean;
  maxCachedTiles: number;
}

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  enabled: true,
  tileBasePath: '/tiles',
  graphPath: staticDataUrl('/data/osm/graph.json'),
  poisPath: staticDataUrl('/data/osm/processed/pois.json'),
  cacheTiles: true,
  maxCachedTiles: 5000,
};

export function loadOfflineConfig(): OfflineConfig {
  try {
    const saved = localStorage.getItem('offline_config');
    if (saved) {
      return { ...DEFAULT_OFFLINE_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[offlineConfig] Failed to load config from localStorage:', e);
  }
  return DEFAULT_OFFLINE_CONFIG;
}

export function saveOfflineConfig(config: OfflineConfig): void {
  try {
    localStorage.setItem('offline_config', JSON.stringify(config));
  } catch (e) {
    console.warn('[offlineConfig] Failed to save config to localStorage:', e);
  }
}

export function isOfflineMode(): boolean {
  return loadOfflineConfig().enabled;
}

export function getOfflineTileUrl(z: number, x: number, y: number): string {
  const config = loadOfflineConfig();
  return `${config.tileBasePath}/${z}/${x}/${y}.png`;
}