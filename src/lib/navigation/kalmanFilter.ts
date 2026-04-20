/**
 * Kalman Filter for GPS smoothing — production-grade.
 *
 * Fuses GPS readings with a constant-velocity kinematic model
 * to suppress jitter, fill gaps between fixes, and provide
 * sub-fix-rate position/velocity/heading estimates.
 *
 * State vector: [lat, lng, vLat, vLng]  (4D)
 * Measurement:  [lat, lng]              (2D)
 *
 * All coordinates are in degrees; velocities are deg/s.
 * For ~100m GPS accuracy the typical process noise is tuned below.
 */

import type { LatLng } from '@/types/taxi';

// ── Constants ────────────────────────────────────────────────────────────────

/** Metres per degree of latitude (approx.) */
const M_PER_DEG_LAT = 111_320;

/** Metres per degree of longitude at a given latitude */
function mPerDegLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

// ── Matrix helpers (4×4 max, inlined for zero-alloc hot path) ───────────────

type Vec4 = [number, number, number, number];
type Mat4 = [Vec4, Vec4, Vec4, Vec4];
type Vec2 = [number, number];
type Mat2 = [Vec2, Vec2];

function mat4Identity(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function mat4Add(a: Mat4, b: Mat4): Mat4 {
  return a.map((row, i) => row.map((v, j) => v + b[i][j])) as Mat4;
}

function mat4MulVec(m: Mat4, v: Vec4): Vec4 {
  return m.map(row => row.reduce((s, c, j) => s + c * v[j], 0)) as Vec4;
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const r: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i][j] += a[i][k] * b[k][j];
  return r as unknown as Mat4;
}

function mat4Transpose(m: Mat4): Mat4 {
  return m[0].map((_, j) => m.map(row => row[j])) as unknown as Mat4;
}

/** Invert a 2×2 matrix (used for Kalman gain denominator) */
function mat2Inv(m: Mat2): Mat2 | null {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (Math.abs(det) < 1e-15) return null;
  const invDet = 1 / det;
  return [
    [m[1][1] * invDet, -m[0][1] * invDet],
    [-m[1][0] * invDet, m[0][0] * invDet],
  ];
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface KalmanState {
  lat: number;
  lng: number;
  vLat: number; // deg/s
  vLng: number; // deg/s
  speedMps: number; // metres per second
  heading: number; // degrees 0-360
  accuracy: number; // estimated accuracy in metres
  timestamp: number; // ms
}

export interface GPSReading {
  lat: number;
  lng: number;
  accuracy?: number; // metres
  speed?: number; // m/s from device
  heading?: number; // degrees from device
  timestamp: number; // ms
}

export interface KalmanFilterConfig {
  /** Process noise σ² for acceleration (deg/s²)². Default: tuned for urban driving. */
  processNoiseAccel?: number;
  /** Minimum measurement noise σ² (degrees²). Prevents over-fitting clean GPS. */
  minMeasurementNoise?: number;
  /** Maximum dt (seconds) before filter reset. Default 10s. */
  maxDtBeforeReset?: number;
  /** Speed threshold (m/s) below which heading is not updated from velocity. */
  minSpeedForHeading?: number;
}

// ── Kalman Filter class ──────────────────────────────────────────────────────

export class NavigationKalmanFilter {
  private x: Vec4 = [0, 0, 0, 0]; // state: [lat, lng, vLat, vLng]
  private P: Mat4 = mat4Identity(); // error covariance
  private lastTimestamp = 0;
  private initialized = false;
  private heading = 0;
  private lastHeadingFromGPS = 0;

  private readonly processNoiseAccel: number;
  private readonly minMeasurementNoise: number;
  private readonly maxDtBeforeReset: number;
  private readonly minSpeedForHeading: number;

  constructor(config: KalmanFilterConfig = {}) {
    // Process noise: how much acceleration variance we expect.
    // Urban driving: ~2 m/s² → convert to deg/s²: 2 / 111320 ≈ 1.8e-5
    this.processNoiseAccel = config.processNoiseAccel ?? 1.8e-5;
    // Min measurement noise: ~5m GPS → 5/111320 ≈ 4.5e-5 deg → σ²≈2e-9
    this.minMeasurementNoise = config.minMeasurementNoise ?? 2e-9;
    this.maxDtBeforeReset = config.maxDtBeforeReset ?? 10;
    this.minSpeedForHeading = config.minSpeedForHeading ?? 1.5; // m/s (~5 km/h)
  }

  /** Process a new GPS reading and return the filtered state. */
  update(reading: GPSReading): KalmanState {
    if (!this.initialized) {
      return this.initialize(reading);
    }

    const dt = (reading.timestamp - this.lastTimestamp) / 1000;

    // If too long since last fix, reset
    if (dt <= 0 || dt > this.maxDtBeforeReset) {
      return this.initialize(reading);
    }

    this.lastTimestamp = reading.timestamp;

    // ── 1. Predict ──────────────────────────────────────────────────────
    const F = this.transitionMatrix(dt);
    const Q = this.processNoiseMatrix(dt);

    // x_pred = F * x
    const xPred = mat4MulVec(F, this.x);

    // P_pred = F * P * F' + Q
    const FP = mat4Mul(F, this.P);
    const Ft = mat4Transpose(F);
    const PPred = mat4Add(mat4Mul(FP, Ft), Q);

    // ── 2. Measurement noise R (2×2) ────────────────────────────────────
    const accMetres = reading.accuracy ?? 15;
    const accDeg = accMetres / M_PER_DEG_LAT;
    const rr = Math.max(accDeg * accDeg, this.minMeasurementNoise);
    const R: Mat2 = [
      [rr, 0],
      [0, rr],
    ];

    // ── 3. Innovation ───────────────────────────────────────────────────
    const z: Vec2 = [reading.lat, reading.lng];
    const y: Vec2 = [z[0] - xPred[0], z[1] - xPred[1]]; // residual

    // S = H * P_pred * H' + R  (H extracts first 2 rows)
    const S: Mat2 = [
      [PPred[0][0] + R[0][0], PPred[0][1] + R[0][1]],
      [PPred[1][0] + R[1][0], PPred[1][1] + R[1][1]],
    ];

    const Sinv = mat2Inv(S);
    if (!Sinv) {
      // Degenerate — just accept measurement
      return this.initialize(reading);
    }

    // ── 4. Kalman gain K (4×2) ──────────────────────────────────────────
    // K = P_pred * H' * S^-1
    // H' columns are [1,0,0,0] and [0,1,0,0]
    const K: [Vec2, Vec2, Vec2, Vec2] = [
      [
        PPred[0][0] * Sinv[0][0] + PPred[0][1] * Sinv[1][0],
        PPred[0][0] * Sinv[0][1] + PPred[0][1] * Sinv[1][1],
      ],
      [
        PPred[1][0] * Sinv[0][0] + PPred[1][1] * Sinv[1][0],
        PPred[1][0] * Sinv[0][1] + PPred[1][1] * Sinv[1][1],
      ],
      [
        PPred[2][0] * Sinv[0][0] + PPred[2][1] * Sinv[1][0],
        PPred[2][0] * Sinv[0][1] + PPred[2][1] * Sinv[1][1],
      ],
      [
        PPred[3][0] * Sinv[0][0] + PPred[3][1] * Sinv[1][0],
        PPred[3][0] * Sinv[0][1] + PPred[3][1] * Sinv[1][1],
      ],
    ];

    // ── 5. Update state ─────────────────────────────────────────────────
    this.x = [
      xPred[0] + K[0][0] * y[0] + K[0][1] * y[1],
      xPred[1] + K[1][0] * y[0] + K[1][1] * y[1],
      xPred[2] + K[2][0] * y[0] + K[2][1] * y[1],
      xPred[3] + K[3][0] * y[0] + K[3][1] * y[1],
    ];

    // ── 6. Update covariance P = (I - K*H) * P_pred ────────────────────
    // I - K*H   (K is 4×2, H is 2×4 → K*H is 4×4)
    const IKH: Mat4 = [
      [1 - K[0][0], -K[0][1], 0, 0],
      [-K[1][0], 1 - K[1][1], 0, 0],
      [-K[2][0], -K[2][1], 1, 0],
      [-K[3][0], -K[3][1], 0, 1],
    ];
    this.P = mat4Mul(IKH, PPred);

    // ── 7. Heading ──────────────────────────────────────────────────────
    this.updateHeading(reading);

    // ── 8. Output ───────────────────────────────────────────────────────
    const speedDegPerSec = Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
    const speedMps =
      speedDegPerSec *
      Math.sqrt(
        M_PER_DEG_LAT * M_PER_DEG_LAT * 0.5 +
          mPerDegLng(this.x[0]) * mPerDegLng(this.x[0]) * 0.5,
      );

    const estAccuracy = Math.sqrt(Math.max(this.P[0][0], this.P[1][1])) * M_PER_DEG_LAT;

    return {
      lat: this.x[0],
      lng: this.x[1],
      vLat: this.x[2],
      vLng: this.x[3],
      speedMps,
      heading: this.heading,
      accuracy: estAccuracy,
      timestamp: reading.timestamp,
    };
  }

  /** Predict position at a future timestamp without a measurement. */
  predict(timestamp: number): KalmanState {
    if (!this.initialized) {
      return { lat: 0, lng: 0, vLat: 0, vLng: 0, speedMps: 0, heading: 0, accuracy: 999, timestamp };
    }

    const dt = (timestamp - this.lastTimestamp) / 1000;
    if (dt <= 0) {
      return this.currentState(timestamp);
    }

    const F = this.transitionMatrix(dt);
    const xPred = mat4MulVec(F, this.x);

    const speedDegPerSec = Math.sqrt(xPred[2] * xPred[2] + xPred[3] * xPred[3]);
    const speedMps =
      speedDegPerSec *
      Math.sqrt(
        M_PER_DEG_LAT * M_PER_DEG_LAT * 0.5 +
          mPerDegLng(xPred[0]) * mPerDegLng(xPred[0]) * 0.5,
      );

    const Q = this.processNoiseMatrix(dt);
    const FP = mat4Mul(F, this.P);
    const PPred = mat4Add(mat4Mul(FP, mat4Transpose(F)), Q);
    const estAccuracy = Math.sqrt(Math.max(PPred[0][0], PPred[1][1])) * M_PER_DEG_LAT;

    return {
      lat: xPred[0],
      lng: xPred[1],
      vLat: xPred[2],
      vLng: xPred[3],
      speedMps,
      heading: this.heading,
      accuracy: estAccuracy,
      timestamp,
    };
  }

  /** Get current filtered state without advancing. */
  currentState(timestamp?: number): KalmanState {
    const speedDegPerSec = Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
    const speedMps =
      speedDegPerSec *
      Math.sqrt(
        M_PER_DEG_LAT * M_PER_DEG_LAT * 0.5 +
          mPerDegLng(this.x[0]) * mPerDegLng(this.x[0]) * 0.5,
      );
    const estAccuracy = Math.sqrt(Math.max(this.P[0][0], this.P[1][1])) * M_PER_DEG_LAT;

    return {
      lat: this.x[0],
      lng: this.x[1],
      vLat: this.x[2],
      vLng: this.x[3],
      speedMps,
      heading: this.heading,
      accuracy: estAccuracy,
      timestamp: timestamp ?? this.lastTimestamp,
    };
  }

  /** Reset filter to uninitialized state. */
  reset(): void {
    this.initialized = false;
    this.x = [0, 0, 0, 0];
    this.P = mat4Identity();
    this.lastTimestamp = 0;
    this.heading = 0;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private initialize(reading: GPSReading): KalmanState {
    const accDeg = (reading.accuracy ?? 15) / M_PER_DEG_LAT;
    const initPosVar = accDeg * accDeg;
    const initVelVar = 1e-8; // ~1 m/s uncertainty in deg/s

    this.x = [reading.lat, reading.lng, 0, 0];
    this.P = [
      [initPosVar, 0, 0, 0],
      [0, initPosVar, 0, 0],
      [0, 0, initVelVar, 0],
      [0, 0, 0, initVelVar],
    ];
    this.lastTimestamp = reading.timestamp;
    this.initialized = true;

    if (reading.heading != null && reading.speed != null && reading.speed > this.minSpeedForHeading) {
      this.heading = reading.heading;
      this.lastHeadingFromGPS = reading.heading;
      // Initialize velocity from device speed + heading
      const rad = (reading.heading * Math.PI) / 180;
      const speedDeg = reading.speed / M_PER_DEG_LAT;
      this.x[2] = speedDeg * Math.cos(rad); // vLat (north component)
      this.x[3] = speedDeg * Math.sin(rad); // vLng (east component)
    }

    return this.currentState(reading.timestamp);
  }

  private transitionMatrix(dt: number): Mat4 {
    return [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
  }

  private processNoiseMatrix(dt: number): Mat4 {
    // Continuous white-noise jerk model → discrete Q
    const q = this.processNoiseAccel;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt / 2;
    const dt4 = dt2 * dt2 / 4;

    return [
      [q * dt4, 0, q * dt3, 0],
      [0, q * dt4, 0, q * dt3],
      [q * dt3, 0, q * dt2, 0],
      [0, q * dt3, 0, q * dt2],
    ];
  }

  private updateHeading(reading: GPSReading): void {
    const speedDegPerSec = Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]);
    const speedMps = speedDegPerSec * M_PER_DEG_LAT;

    if (speedMps > this.minSpeedForHeading) {
      // Compute heading from velocity vector
      const headingFromVelocity = (Math.atan2(this.x[3], this.x[2]) * 180) / Math.PI;
      const normalized = (headingFromVelocity + 360) % 360;

      // If device provides heading and speed, blend
      if (reading.heading != null && reading.speed != null && reading.speed > this.minSpeedForHeading) {
        this.lastHeadingFromGPS = reading.heading;
        // Weighted blend: 70% velocity-derived, 30% device compass
        this.heading = this.blendAngles(normalized, reading.heading, 0.7);
      } else {
        this.heading = normalized;
      }
    } else if (reading.heading != null) {
      // Stationary — use device compass
      this.heading = reading.heading;
      this.lastHeadingFromGPS = reading.heading;
    }
    // else keep last heading
  }

  /** Blend two angles (degrees) with weight α for angle a. */
  private blendAngles(a: number, b: number, alpha: number): number {
    const radA = (a * Math.PI) / 180;
    const radB = (b * Math.PI) / 180;
    const x = alpha * Math.cos(radA) + (1 - alpha) * Math.cos(radB);
    const y = alpha * Math.sin(radA) + (1 - alpha) * Math.sin(radB);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
}

// ── Singleton for app-wide use ───────────────────────────────────────────────

let _instance: NavigationKalmanFilter | null = null;

export function getKalmanFilter(config?: KalmanFilterConfig): NavigationKalmanFilter {
  if (!_instance) {
    _instance = new NavigationKalmanFilter(config);
  }
  return _instance;
}

export function resetKalmanFilter(): void {
  _instance?.reset();
  _instance = null;
}
