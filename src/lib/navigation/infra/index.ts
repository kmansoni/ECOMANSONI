/**
 * Публичный API сканера дорожной инфраструктуры.
 */

export { scanInfrastructure } from './overpassScanner';
export {
  getInfraFromCache,
  putInfraIntoCache,
  clearInfraCache,
  pruneExpired,
} from './infraCache';
export {
  classifySign,
  parseLaneRefs,
  getSignAtlasKey,
  getSignTitle,
} from './signClassifier';
export {
  elevationFromLayer,
  bridgeHeightAtPoint,
  tunnelDepthAtPoint,
  sortBridgesByLayer,
} from './bridgeElevation';
