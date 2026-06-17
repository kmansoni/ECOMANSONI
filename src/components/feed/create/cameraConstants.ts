export const BASE_ZOOM_LEVELS = [0.5, 1, 2, 3, 5, 8, 15] as const;

export const RECORDING_DURATIONS = [
  { label: '30с', ms: 30_000 },
  { label: '1м', ms: 60_000 },
  { label: '3м', ms: 180_000 },
  { label: '10м', ms: 600_000 },
  { label: '15м', ms: 900_000 },
] as const;
