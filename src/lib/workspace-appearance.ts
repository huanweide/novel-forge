// 纯前端：扫描章节正文，找出每个实体最后一次出现的章节。
// 与正文实体高亮同源（都用 name / alias / title / key 做 includes 匹配），无需任何接口请求。
// 用途：在角色卡 / 世界书卡片上提示「该角色上次出现在第 X 章」，点击可跳转到该章。

export interface LastAppearance {
  /** 出现章节的节点 id（用于跳章） */
  nodeId: string;
  /** 出现章节的标题 */
  nodeTitle: string;
  /** 出现章节的排序号（通常即章节序号） */
  order: number;
}

export interface AppearanceNode {
  id: string;
  title: string;
  content: string | null;
  order: number;
  deletedAt?: string | null | Date;
}

export interface AppearanceEntity {
  id: string;
  /** 用于匹配的实体名集合：角色为 name + aliases；世界书为 title + keys */
  names: string[];
}

/**
 * 计算每个实体最后一次出现的章节。
 * @param nodes 项目全部章节（含 content 全文）
 * @param entities 待查询的实体（角色 / 世界书条目）
 * @returns 以实体 id 为键，值为「上次出现」信息或 null（从未出现）
 */
export function computeLastAppearances(
  nodes: AppearanceNode[],
  entities: AppearanceEntity[],
): Record<string, LastAppearance | null> {
  const result: Record<string, LastAppearance | null> = {};
  if (!entities.length) return result;
  for (const e of entities) result[e.id] = null;

  const sorted = (nodes ?? [])
    .filter((n) => !n.deletedAt)
    .slice()
    .sort((a, b) => a.order - b.order);
  if (!sorted.length) return result;

  const valid = entities
    .map((e) => ({ id: e.id, names: e.names.filter((n) => !!n && n.length > 0) }))
    .filter((e) => e.names.length > 0);
  if (!valid.length) return result;

  // 按 order 升序遍历：后出现的章节自然覆盖先出现的，最终保留「最后一次」
  for (const node of sorted) {
    const text = node.content ?? "";
    if (!text) continue;
    for (const ent of valid) {
      for (const name of ent.names) {
        if (text.includes(name)) {
          result[ent.id] = { nodeId: node.id, nodeTitle: node.title, order: node.order };
          break; // 该实体已在本章出现，取本章（最后一次覆盖）
        }
      }
    }
  }
  return result;
}
