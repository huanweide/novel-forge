// 工具箱类型与分类元数据。
// 说明：原 ToolboxDialog 模态弹窗已合并进 RightPanel 的「工具箱」tab（两者渲染同一份
// toolboxItems），为避免重复入口，此处仅保留类型定义与分类元数据，供 RightPanel 复用。
import type { IconName } from "@/components/ui/icons";

export type ToolboxCategory = "write" | "generate" | "analyze";

export interface ToolboxItem {
  id: string;
  label: string;
  desc: string;
  icon: IconName;
  category: ToolboxCategory;
  action: () => void;
  badge?: string;
}

export const CATEGORY_META: Record<ToolboxCategory, { label: string; desc: string; accent: string }> = {
  write: { label: "写作辅助", desc: "推进正文与结构", accent: "var(--nv-primary)" },
  generate: { label: "内容生成", desc: "创造设定与方向", accent: "var(--nv-creative)" },
  analyze: { label: "智能分析", desc: "检查质量与逻辑", accent: "var(--nv-accent)" },
};
