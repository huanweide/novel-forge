export {
  STYLE_TEMPLATES,
  getTemplate,
  applyTemplate,
  forbiddenPatternsToPrompt,
} from "./styles";
export type { StyleTemplate } from "./styles";

export {
  OUTLINE_TEMPLATES,
  getOutlineTemplate,
  calculateChapterPlan,
  outlineTemplateToPrompt,
} from "./outlines";
export type { OutlineTemplate, OutlineStage } from "./outlines";
