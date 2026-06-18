export { runDissection, detectChapters, convertToProject } from "./engine";
export { buildImitationContext, streamImitation } from "./imitation-engine";
export { buildDimensionPrompt, buildQuickExtractPrompt, buildChapterSummaryPrompt } from "./prompts";
export {
  DISSECT_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_ICONS,
  DIMENSION_GROUPS,
} from "./types";
export type {
  DissectDepth,
  DissectStatus,
  DimensionKey,
  DimensionResult,
  ChapterInfo,
  ImitationMode,
  ImitationRequest,
  DissectionTaskData,
} from "./types";
