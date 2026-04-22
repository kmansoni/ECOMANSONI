/**
 * Типы данных для системы сканирования карты (survey)
 */

import type { Json } from '@/types/supabase';

// ---------------------------------------------------------------------------
// Basic enums
// ---------------------------------------------------------------------------

export type SurveyScanStatus = 'processing' | 'ready' | 'proposed' | 'approved' | 'rejected' | 'failed' | 'merged';
export type SurveyScanType = 'building' | 'road' | 'bridge' | 'intersection' | 'street_furniture' | 'area';

export interface SurveySessionMetadata {
  capture_mode: 'auto' | 'manual' | 'background';
  device_model: string;
  os_version: string;
  camera_facing: 'front' | 'back';
  photo_count: number;
  avg_gps_accuracy_m: number;
  track_length_m: number;
  duration_sec: number;
  capture_settings?: {
    keyframe_interval_m: number;
    min_overlap_pct: number;
    compression_quality: number;
    framerate_fps?: number;
  };
  processing?: {
    method: 'openmvg' | 'lidar' | 'arcoreslam' | 'manual';
    point_count?: number;
    reprojection_error_px?: number;
    compute_time_sec?: number;
    sfm_reconstruction_id?: string;
  };
}

export interface ComputedDimensions {
  length_m: number;
  width_m: number;
  height_m?: number;
  area_m2: number;
  volume_m3?: number;
  confidence: number;        // [0-1]
  method: 'photogrammetry' | 'lidar' | 'ar_planes' | 'manual';
  accuracy_estimate_m: number; // meters
}

// ---------------------------------------------------------------------------
// Database tables
// ---------------------------------------------------------------------------

export type SurveyScan = {
  id: string;
  user_id: string;
  scan_type: SurveyScanType;
  images: string[];         // URLs
  metadata: SurveySessionMetadata;
  track_linestring: string | null;  // WKT
  computed_dimensions: ComputedDimensions | null;
  footprint_geometry: string | null;  // WKT
  elevated_geometry: string | null;   // WKT (EPSG:3857)
  quality_score: number;
  completeness_pct: number;
  validation_score: number | null;
  status: SurveyScanStatus;
  source_edit_id: string | null;
  h3_cell: string | null;
  tags: Json;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  merged_at: string | null;
};

export type SurveyScanInsert = Omit<SurveyScan, 'id' | 'created_at' | 'updated_at' | 'processed_at' | 'merged_at'>;
export type SurveyScanUpdate = Partial<Omit<SurveyScan, 'id' | 'user_id' | 'created_at'>>;

// ---------------------------------------------------------------------------
// Map display
// ---------------------------------------------------------------------------

export interface SurveyScanFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];  // [ [lng, lat], ... ]
  };
  properties: {
    id: string;
    scan_type: SurveyScanType;
    quality_score: number;
    completeness_pct: number;
    status: SurveyScanStatus;
    dimensions: ComputedDimensions | null;
    user_id: string;
    photo_count: number;
    is_your_scan: boolean;
  };
}

export interface SurveyHeatmapHex {
  h3_cell: string;
  scan_count: number;
  avg_quality: number;
  max_completeness: number;
  contributor_count: number;
  last_scan_at: string;
}

// ---------------------------------------------------------------------------
// Worker messages
// ---------------------------------------------------------------------------

export type WorkerMessage =
  | { type: 'init'; payload: { workerId: string } }
  | { type: 'new_keyframe'; payload: Keyframe }
  | { type: 'process_batch'; payload: { batchId: string; keyframes: Keyframe[] } }
  | { type: 'get_status' }
  | { type: 'abort' };

export type WorkerResponse =
  | { type: 'status'; payload: ProcessingStatus }
  | { type: 'pointcloud_update'; payload: PointCloudUpdate }
  | { type: 'dimensions_update'; payload: DimensionsUpdate }
  | { type: 'batch_ready'; payload: { batchId: string; data: UploadBatch } }
  | { type: 'error'; payload: { message: string } };

export interface Keyframe {
  id: string;
  timestamp: number;
  imageData: ImageData | ArrayBuffer;  // compressed JPEG bytes
  pose: Pose6DoF;
  gps: {
    lat: number;
    lng: number;
    alt: number;
    accuracy: number;
  };
  motion: MotionData;
  quality: ImageQuality;
}

export interface Pose6DoF {
  x: number;  // meters (East)
  y: number;  // meters (North)
  z: number;  // meters (Up)
  rx: number; // roll (rad)
  ry: number; // pitch (rad)
  rz: number; // yaw (rad)
}

export interface MotionData {
  translation: number;  // m/s
  rotation: number;     // deg/s
  magnitude: number;    // overall motion score [0-1]
}

export interface ImageQuality {
  blur_score: number;      // 0-100 (higher = sharper)
  lighting_score: number;  // 0-100
  overlap_estimate: number; // % with previous frame
  overall: number;         // weighted average 0-100
}

export interface PointCloudUpdate {
  points: Float32Array;  // [x, y, z, r, g, b, confidence, ...] interleaved
  camera_pose: Pose6DoF;
  point_count: number;
}

export interface DimensionsUpdate {
  length_m: number;
  width_m: number;
  height_m?: number;
  confidence: number;
  object_type: SurveyScanType;
  completeness_pct: number;
}

export interface UploadBatch {
  batch_id: string;
  keyframes: Keyframe[];
  point_cloud: Float32Array | null;  // accumulated sparse cloud
  poses: Pose6DoF[];
  session_meta: SurveySessionMetadata;
  created_at: number;
}

export interface ProcessingStatus {
  is_running: boolean;
  keyframes_processed: number;
  point_count: number;
  current_quality: number;
  fps: number;
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

export interface SurveySession {
  isActive: boolean;
  mode: SurveyScanType | null;
  photos: CapturedPhoto[];
  track: LatLngWithAlt[];
  startTime: number | null;
  currentQuality: number;  // 0-100
  status: 'idle' | 'capturing' | 'processing' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  computedDimensions?: ComputedDimensions;
  uploadedScanId?: string;
}

export interface CapturedPhoto {
  file: File | Blob;
  url: string;          // object URL for preview
  lat: number;
  lng: number;
  alt?: number;
  heading: number;
  accuracy: number;
  timestamp: number;
  qualityScore: number;
  blur?: number;
  uploaded?: boolean;
  uploadProgress?: number;
}

export interface LatLngWithAlt {
  lat: number;
  lng: number;
  alt?: number;
  accuracy?: number;
  heading?: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SurveySettings {
  enabled: boolean;               // Включено ли сканирование вообще
  autoMode: boolean;              // Автоматический режим (не требующий нажатий)
  backgroundScanning: boolean;    // Сканировать в фоне (приложение закрыто)
  wifiOnly: boolean;              // Загружать только на Wi-Fi
  quality: 'low' | 'medium' | 'high';  // Качество (влияет на количество фото)
  minOverlapPercent: number;      // Минимальное перекрытие 60-80%
  showLiveLayer: boolean;         // Показывать live scanning на карте
  contributePublicly: boolean;    // Делать сканы публичными сразу
}

// ---------------------------------------------------------------------------
// API Responses
// ---------------------------------------------------------------------------

export interface SurveyUploadResponse {
  scan_id: string;
  status: SurveyScanStatus;
  message: string;
  estimated_processing_time_sec: number;
}

export interface SurveyProcessingWebhook {
  scan_id: string;
  status: SurveyScanStatus;
  computed_dimensions?: ComputedDimensions;
  footprint_geometry?: string;
  quality_score?: number;
  completeness_pct?: number;
  error_message?: string;
}
