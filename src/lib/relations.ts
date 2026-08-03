/**
 * 角色关系字段归一化（共享工具）。
 *
 * 旧备份 / 外部导入可能用旧格式 {target, type}，
 * 而 sync-global-prompt 与角色卡关系图只认 {targetName, relation}，
 * 否则编译/展示出「?(?)」。
 *
 * 本模块被两处导入路径共享：
 *  - 导入合并（import/commit/route.ts）
 *  - 备份还原（projects/import/route.ts）
 * 避免关系字段静默失效、关系图断裂（工坊 P1）。
 */
export function normalizeRelationships(raw: unknown): { targetName: string; relation: string }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((r: any) => r && (r.targetName || r.target))
    .map((r: any) => ({
      targetName: String(r.targetName ?? r.target ?? "").trim(),
      relation: String(r.relation ?? r.type ?? "").trim(),
    }))
    .filter((r: { targetName: string }) => r.targetName.length > 0);
}
