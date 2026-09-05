// 撤销预设注入：按 apply 留下的「可撤销凭证」精准回退。
// 顺序：先还原被覆盖的旧值（逆序，后覆盖的先还原），再删除本次新建的实体。
// 所有操作单条容错——某条已被手动删掉不阻断整体撤销，只记进 skipped 供 UI 提示。

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaUndoWriter {
  loreTable: { delete(args: any): Promise<any> };
  styleCard: {
    delete(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  lorebookEntry: {
    delete(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  characterCard: { delete(args: any): Promise<any> };
  project: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface UndoResult {
  /** 已删除的新建实体（kind:name） */
  deleted: string[];
  /** 已还原的被覆盖项（kind:name） */
  restored: string[];
  /** 跳过项（记录不存在等，附带原因） */
  skipped: string[];
}

interface CrtItem {
  kind: string;
  id: string;
  name: string;
}
interface UpdItem {
  kind: string;
  id: string;
  name: string;
  before: unknown;
}

export async function executeUndo(
  db: PrismaUndoWriter,
  projectId: string,
  record: Partial<{
    created: CrtItem[];
    updatedBefore: UpdItem[];
    ruleNames: string[];
    configKeys: string[];
  }> | null | undefined,
): Promise<UndoResult> {
  const deleted: string[] = [];
  const restored: string[] = [];
  const skipped: string[] = [];

  if (!record) return { deleted, restored, skipped: ["无撤销记录"] };

  const created: CrtItem[] = Array.isArray(record.created) ? record.created : [];
  const updatedBefore: UpdItem[] = Array.isArray(record.updatedBefore) ? record.updatedBefore : [];

  // ── 1) 还原被覆盖的旧值（逆序） ──
  for (let i = updatedBefore.length - 1; i >= 0; i -= 1) {
    const u = updatedBefore[i];
    try {
      if (u.kind === "style" && u.id && u.before) {
        await db.styleCard.update({ where: { id: u.id }, data: u.before });
        restored.push(`style:${u.name}`);
      } else if (u.kind === "lorebook" && u.id && u.before) {
        await db.lorebookEntry.update({ where: { id: u.id }, data: u.before });
        restored.push(`lorebook:${u.name}`);
      } else if (u.kind === "regex") {
        const project = await db.project.findUnique({ where: { id: projectId } });
        const rules = (Array.isArray(project?.postProcessingRules)
          ? [...(project!.postProcessingRules as Record<string, unknown>[])]
          : []);
        const idx = rules.findIndex((r) => r && r.name === String(u.name));
        if (idx >= 0) {
          if (u.before) rules[idx] = u.before as Record<string, unknown>;
          else rules.splice(idx, 1);
          await db.project.update({ where: { id: projectId }, data: { postProcessingRules: rules } });
          restored.push(`regex:${u.name}`);
        }
      } else if (u.kind === "api_config") {
        const before = (u.before || {}) as {
          values?: Record<string, unknown>;
          addedKeys?: string[];
        };
        const project = await db.project.findUnique({ where: { id: projectId } });
        const cfg: Record<string, unknown> = { ...((project?.llmConfig as Record<string, unknown>) || {}) };
        for (const k of before.addedKeys || []) delete cfg[k];
        for (const [k, v] of Object.entries(before.values || {})) cfg[k] = v;
        await db.project.update({ where: { id: projectId }, data: { llmConfig: cfg } });
        restored.push("api_config:LLM参数");
      }
    } catch (e) {
      skipped.push(`${u.kind}:${u.name}（还原失败：${e instanceof Error ? e.message : String(e)}）`);
    }
  }

  // ── 2) 删除本次新建的实体 ──
  for (const c of created) {
    try {
      if (c.kind === "table") {
        await db.loreTable.delete({ where: { id: c.id } });
        deleted.push(`table:${c.name}`);
      } else if (c.kind === "style") {
        await db.styleCard.delete({ where: { id: c.id } });
        deleted.push(`style:${c.name}`);
      } else if (c.kind === "lorebook") {
        await db.lorebookEntry.delete({ where: { id: c.id } });
        deleted.push(`lorebook:${c.name}`);
      } else if (c.kind === "character") {
        await db.characterCard.delete({ where: { id: c.id } });
        deleted.push(`character:${c.name}`);
      } else if (c.kind === "regex") {
        const project = await db.project.findUnique({ where: { id: projectId } });
        const rules = (Array.isArray(project?.postProcessingRules)
          ? [...(project!.postProcessingRules as Record<string, unknown>[])]
          : []);
        const next = rules.filter((r) => !r || r.name !== String(c.name));
        if (next.length !== rules.length) {
          await db.project.update({ where: { id: projectId }, data: { postProcessingRules: next } });
          deleted.push(`regex:${c.name}`);
        }
      }
    } catch (e) {
      skipped.push(`${c.kind}:${c.name}（删除失败，可能已被手动删除）`);
    }
  }

  // ── 3) 向后兼容：老版 appliedPresets 记录只有 ruleNames / configKeys ──
  if (!created.length && !updatedBefore.length) {
    const ruleNames: string[] = Array.isArray(record.ruleNames) ? record.ruleNames : [];
    const configKeys: string[] = Array.isArray(record.configKeys) ? record.configKeys : [];
    if (ruleNames.length) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      const rules = (Array.isArray(project?.postProcessingRules)
        ? [...(project!.postProcessingRules as Record<string, unknown>[])]
        : []);
      const set = new Set(ruleNames);
      const next = rules.filter((r) => !r || !set.has(String(r.name)));
      if (next.length !== rules.length) {
        await db.project.update({ where: { id: projectId }, data: { postProcessingRules: next } });
        deleted.push(...ruleNames.map((n) => `regex:${n}`));
      }
    }
    if (configKeys.length) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      const cfg: Record<string, unknown> = { ...((project?.llmConfig as Record<string, unknown>) || {}) };
      for (const k of configKeys) delete cfg[k];
      await db.project.update({ where: { id: projectId }, data: { llmConfig: cfg } });
      deleted.push(...configKeys.map((k) => `api_config:${k}`));
    }
  }

  return { deleted, restored, skipped };
}
