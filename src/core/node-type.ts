import type { StoryNodeType } from "./types";

/**
 * 节点类型单一真相源（v2.47 地基止血）。
 *
 * 取代散落的 "section" / "chapter" 等裸串字面量，消除拼写错误导致的静默 bug，
 * 并用 `satisfies` 约束取值必须落在 StoryNodeType 联合内，使 TS 在编译期保证合法。
 * story-node-bridge.ts / 各生成路由 / 工作区前端统一从此处引用。
 */
export const NODE_TYPE = {
  VOLUME: "volume",
  CHAPTER: "chapter",
  SECTION: "section",
  SCENE: "scene",
} as const satisfies Record<string, StoryNodeType>;

export type NodeTypeValue = (typeof NODE_TYPE)[keyof typeof NODE_TYPE];
