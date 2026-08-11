// 管线统一导出
export { loadGenerationContext } from "./context-loader";
export {
  handleNewCharacters,
  filterByConfirmedCards,
  buildCardNotesText,
  prepareAuthorNote,
  extractLLMConfig,
  buildGenerationContext,
} from "./pre-processor";
export { runPostGenerationPipeline } from "./post-processor";
export {
  loadOutlineData,
  extractPrevContext,
  extractNextContext,
  buildCharacterList,
  prepareOutlineDirective,
  formatSummaries,
  formatStorylines,
  loadStorylinesWithEvents,
  filterActiveStorylines,
} from "./outline-context";
export type { OutlineContextData, FormatStorylinesOptions } from "./outline-context";
export { rebuildProjectDigest, formatDigest } from "./digest";
export type { ProjectDigest } from "./digest";
export { computeNarrativeStage, formatStage } from "./narrative-stage";
export type { NarrativeStage, NarrativeStageKey } from "./narrative-stage";
export { injectContextBlocks } from "./instruction-context";
export { computePlotEventAdoptions } from "./plot-event";
export type { PlotEventAdoptInput, PlotEventToCreate, PlotEventAdoptOutput } from "./plot-event";
export type { GenerationData, LLMExtract, PostPipelineParams, PostPipelineResult } from "./types";
