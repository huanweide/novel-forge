import type { CharacterData } from "@/components/workspace/types";

export interface CharacterFilterCriteria {
  search: string;
  roleFilter: string;
  tagFilter: string;
  statusFilter: string;
}

/**
 * 用户自建标签判定：排除系统标签（📥 导入 / 📝 备注）与软删标记（🗂 已合并）。
 * 角色卡「🗂 已合并」表示已被去重合并（软删），不应再作为可筛选的用户标签出现。
 */
export function isUserTag(tag: string): boolean {
  return !tag.startsWith("📥") && !tag.startsWith("📝") && tag !== "🗂 已合并";
}

/**
 * 角色列表过滤（v2.17 引入、v2.18 抽为纯函数便于单测）。
 * 规则（与旧 CharacterList 内联逻辑完全一致）：
 * - 已合并（软删「🗂 已合并」）卡默认隐藏，实现「去重后自动清除重复名」；
 * - roleFilter：all 或具体角色值；
 * - tagFilter：all / has-tags（有用户标签）/ no-tags（无用户标签）/ 具体标签；
 * - statusFilter：all / alive / dead（dead 含 missing、presumed_dead）；
 * - search：匹配 name 或任一 alias 子串。
 */
export function filterCharacters(
  characters: CharacterData[],
  c: CharacterFilterCriteria,
): CharacterData[] {
  return characters.filter((ch) => {
    // v2.17：被合并（软删）的角色卡默认从列表隐藏
    if ((ch.tags || []).includes("🗂 已合并")) return false;
    if (c.roleFilter !== "all" && ch.role !== c.roleFilter) return false;
    const userTags = (ch.tags || []).filter(isUserTag);
    if (c.tagFilter === "no-tags" && userTags.length > 0) return false;
    if (c.tagFilter === "has-tags" && userTags.length === 0) return false;
    if (
      c.tagFilter !== "all" &&
      c.tagFilter !== "no-tags" &&
      c.tagFilter !== "has-tags" &&
      !userTags.includes(c.tagFilter)
    )
      return false;
    if (c.statusFilter === "alive" && ch.currentStatus !== "alive") return false;
    if (
      c.statusFilter === "dead" &&
      !["dead", "missing", "presumed_dead"].includes(ch.currentStatus)
    )
      return false;
    if (
      c.search &&
      !ch.name.includes(c.search) &&
      !(ch.aliases || []).some((a) => a.includes(c.search))
    )
      return false;
    return true;
  });
}
