/**
 * Публичный API 3D-движка дороги.
 */

export {
  ThreeOverlay,
  lngLatToSceneXY,
  disposeScene,
  type ThreeOverlayOptions,
} from './threeOverlay';

export { buildRoadSurfaceMesh, buildMarkingsMesh } from './roadMeshBuilder';
export { buildSignsInstancedMesh, attachSignMetadata } from './signModels';
export { buildCamerasMesh, attachCameraMetadata } from './cameraModels';
export {
  applyLighting,
  applyLightingForNow,
  lightingForHour,
  type LightingConfig,
} from './lightingSystem';
export { LODManager, type LODConfig } from './lodManager';
export { buildVehicleModel, type VehicleHandle } from './vehicleModel';
export {
  HDRoadSceneOrchestrator,
  type OrchestratorOptions,
  type HDInfraHit,
} from './hdRoadSceneOrchestrator';
export {
  getOrCreateSignTexture,
  disposeSignTextureCache,
} from './signTextureGenerator';
