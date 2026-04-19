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
  graphPath: '/data/osm/graph.json',
  poisPath: '/data/osm/processed/pois.json',
  cacheTiles: true,
  maxCachedTiles: 5000,
};

export function loadOfflineConfig(): OfflineConfig {
  try {
    const saved = localStorage.getItem('offline_config');
    if (saved) {
      return { ...DEFAULT_OFFLINE_CONFIG, ...JSON.parse(saved) };
    }
  } catch {}
  return DEFAULT_OFFLINE_CONFIG;
}

export function saveOfflineConfig(config: OfflineConfig): void {
  try {
    localStorage.setItem('offline_config', JSON.stringify(config));
  } catch {}
}

export function isOfflineMode(): boolean {
  return loadOfflineConfig().enabled;
}

export function getOfflineTileUrl(z: number, x: number, y: number): string {
  const config = loadOfflineConfig();
  return `${config.tileBasePath}/${z}/${x}/${y}.png`;
}