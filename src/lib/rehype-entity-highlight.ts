/**
 * rehype 插件：在 HTML AST 文本节点中匹配实体名并包裹彩色 span。
 *
 * 只在段落文本中生效——跳过 code/pre/a 标签内的内容。
 * 最长名优先，避免短名提前吃掉长名的前缀。
 */

import type { EntityHighlight } from "@/core/entity-highlighter";
import { findEntitiesInText } from "@/core/entity-highlighter";

// HAST 节点类型（兼容 unified 生态）
interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

/** 需要跳过的标签——里面的文本不高亮（v0.46.58：加 h1-h6 标题与引用块，章头不显示高亮标记） */
const SKIP_TAGS = new Set(["code", "pre", "a", "script", "style", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);

/** 分类中文标签（用于 title/aria 非颜色线索，WCAG 1.4.1） */
function categoryLabel(category?: string): string {
  const labels: Record<string, string> = {
    faction: "势力",
    item: "物品",
    geography: "地点",
    magic_system: "力量体系",
    technique: "功法",
    creature: "生物种族",
    culture: "文化",
    history: "历史",
    law: "法则",
    currency: "货币",
    custom: "自定义",
  };
  return (category && labels[category]) || "词条";
}

/**
 * 在文本中查找所有实体匹配位置（委托给共享 findEntitiesInText）。
 */
function findEntityRanges(
  text: string,
  entityMap: Map<string, EntityHighlight>,
): Array<{ start: number; end: number; entity: EntityHighlight }> {
  const matches = findEntitiesInText(text, entityMap);
  return matches.map((m) => ({
    start: m.start,
    end: m.end,
    entity: { name: m.name, color: m.color, type: m.type, category: m.category, id: m.id },
  }));
}

/**
 * 将文本节点按实体匹配拆分为 text + span 节点数组。
 * 无匹配 → 返回 null（不修改）。
 */
function splitTextNode(
  text: string,
  entityMap: Map<string, EntityHighlight>,
): HastNode[] | null {
  const ranges = findEntityRanges(text, entityMap);
  if (ranges.length === 0) return null;

  const nodes: HastNode[] = [];
  let cursor = 0;

  for (const r of ranges) {
    // 匹配前的普通文本
    if (r.start > cursor) {
      nodes.push({ type: "text", value: text.slice(cursor, r.start) });
    }
    // 实体 span
    const typeLabel = r.entity.type === "character" ? "角色" : categoryLabel(r.entity.category);
    nodes.push({
      type: "element",
      tagName: "span",
      properties: {
        className:
          `entity-highlight entity-${r.entity.type}` +
          (r.entity.type === "lorebook" && r.entity.category
            ? ` entity-cat-${r.entity.category}`
            : ""),
        style: `color:${r.entity.color};`,
        title: `${typeLabel}：${r.entity.name}`,
        "aria-label": `${typeLabel}：${r.entity.name}`,
        "data-entity-name": r.entity.name,
        "data-entity-type": r.entity.type,
        ...(r.entity.id ? { "data-entity-id": r.entity.id } : {}),
        ...(r.entity.category ? { "data-entity-category": r.entity.category } : {}),
        role: "button",
        tabIndex: 0,
      },
      children: [{ type: "text", value: r.entity.name }],
    });
    cursor = r.end;
  }

  // 剩余文本
  if (cursor < text.length) {
    nodes.push({ type: "text", value: text.slice(cursor) });
  }

  return nodes;
}

/**
 * 递归遍历 HAST 树，替换文本节点中的实体名。
 */
function walkAndHighlight(
  node: HastNode,
  entityMap: Map<string, EntityHighlight>,
) {
  if (!node || typeof node !== "object") return;

  // 跳过特定标签的内部
  if (node.tagName && SKIP_TAGS.has(node.tagName)) return;

  if (Array.isArray(node.children)) {
    const newChildren: HastNode[] = [];

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      if (child.type === "text" && typeof child.value === "string") {
        const parts = splitTextNode(child.value, entityMap);
        if (parts) {
          newChildren.push(...parts);
          // 有替换 → 继续
        } else {
          newChildren.push(child);
        }
      } else {
        // 递归进入子元素
        walkAndHighlight(child, entityMap);
        newChildren.push(child);
      }
    }

    node.children = newChildren;
  }
}

/**
 * 创建 rehype 插件。
 *
 * @param getEntityMap - 异步获取实体映射的函数
 *
 * 由于 rehype 插件是同步的，entityMap 必须在调用前准备好。
 * 返回的函数接收预加载的 entityMap。
 */
export function rehypeEntityHighlight(entityMap: Map<string, EntityHighlight>) {
  return function plugin() {
    return (tree: HastNode) => {
      walkAndHighlight(tree, entityMap);
    };
  };
}
