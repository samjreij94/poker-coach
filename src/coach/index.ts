export { classifyHand, classifyPreflop, estimateOuts } from './handClass';
export { recommend } from './recommend';
export type { RecommendInput, CoachAdviceInternal } from './recommend';
export { gradeAction, sizeSpecOf } from './grade';
export { recommendInputFromView } from './fromTableView';
export { tagBoard, sprBandFromValue, isDryish, isWetish, hasTag } from './board';
export { handKey, OPEN_CHART, isInOpenChart, classifyPreflopFacing } from './preflop';
export { COACH_STRINGS, whyFor } from './strings';
export type {
  BoardTag,
  SprBand,
  ReasonCode,
  FrequencyBand,
  PreflopBucket,
  FacingKind,
  SizeRangeSpec,
} from './types';
