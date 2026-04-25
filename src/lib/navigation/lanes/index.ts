/**
 * Публичный API HD-полос.
 */

export {
  buildLanesFromCenterline,
  enrichLanesWithHDGeometry,
  type BuiltLaneGeometry,
} from './hdLaneBuilder';

export {
  buildMarkingsForLaneGroup,
  getMarkingSpec,
  type MarkingRenderSpec,
} from './markingRenderer';

export {
  applyLaneSplit,
  detectSplitsFromTurns,
  buildArrowsForLanes,
} from './laneSplitMerge';
