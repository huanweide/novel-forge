import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// 去掉会导致冲突的字段（让 Prisma 重新生成 id / 时间戳 / 关联）
function strip<T extends Record<string, any>>(o: T, keys: string[]): Record<string, any> {
  const c: Record<string, any> = { ...o };
  for (const k of keys) delete c[k];
  return c;
}

// POST /api/projects/import —— 从 .nfproject 备份包导入为新项目（id 全部重映射）
export async function POST(request: Request) {
  try {
    const bundle = await request.json();
    const p = bundle?.project;
    if (!p || typeof p !== "object") {
      return NextResponse.json({ error: "备份文件格式不正确（缺少 project）" }, { status: 400 });
    }
    if (bundle.format !== "nfproject") {
      return NextResponse.json({ error: "不是有效的 .nfproject 备份文件" }, { status: 400 });
    }

    // 1. 项目本体
    const projData = strip(p, [
      "id", "createdAt", "updatedAt", "deletedAt",
      "characters", "lorebookEntries", "storyNodes", "storyBranches",
      "storylines", "styleCards", "loreTables", "rules",
    ]);
    projData.name = (projData.name || "导入的项目") + "（导入）";

    const created = await prisma.project.create({ data: projData as any });
    const newPid = created.id;

    // 2. 故事分支（id 重映射）
    const branchMap: Record<string, string> = {};
    for (const b of p.storyBranches || []) {
      const cb = await prisma.storyBranch.create({
        data: { ...strip(b, ["id", "projectId", "createdAt", "forkPointNodeId"]), projectId: newPid } as any,
      });
      branchMap[b.id] = cb.id;
    }

    // 3. 章节节点 pass1 创建（不带 parent/branch），pass2 回填 parentId/branchId
    const nodeMap: Record<string, string> = {};
    for (const n of p.storyNodes || []) {
      const cn = await prisma.storyNode.create({
        data: { ...strip(n, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid, revisionCount: 0 } as any,
      });
      nodeMap[n.id] = cn.id;
    }
    for (const n of p.storyNodes || []) {
      const upd: Record<string, any> = {};
      if (n.parentId && nodeMap[n.parentId]) upd.parentId = nodeMap[n.parentId];
      if (n.branchId && branchMap[n.branchId]) upd.branchId = branchMap[n.branchId];
      if (Object.keys(upd).length) {
        await prisma.storyNode.update({ where: { id: nodeMap[n.id] }, data: upd });
      }
    }

    // 4. 世界书词条（parentId / relatedEntryIds 重映射）
    const loreMap: Record<string, string> = {};
    for (const l of p.lorebookEntries || []) {
      const cl = await prisma.lorebookEntry.create({
        data: { ...strip(l, ["id", "projectId", "createdAt", "updatedAt", "parentId", "relatedEntryIds"]), projectId: newPid } as any,
      });
      loreMap[l.id] = cl.id;
    }
    for (const l of p.lorebookEntries || []) {
      const upd: Record<string, any> = {};
      if (l.parentId && loreMap[l.parentId]) upd.parentId = loreMap[l.parentId];
      if (Array.isArray(l.relatedEntryIds)) {
        const remapped = (l.relatedEntryIds as string[]).map((rid) => loreMap[rid]).filter(Boolean);
        if (remapped.length) upd.relatedEntryIds = remapped;
      }
      if (Object.keys(upd).length) {
        await prisma.lorebookEntry.update({ where: { id: loreMap[l.id] }, data: upd });
      }
    }

    // 5. 其余扁平子表
    for (const c of p.characters || []) {
      await prisma.characterCard.create({ data: { ...strip(c, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid } as any });
    }
    for (const s of p.storylines || []) {
      await prisma.storyline.create({ data: { ...strip(s, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid } as any });
    }
    for (const sc of p.styleCards || []) {
      await prisma.styleCard.create({ data: { ...strip(sc, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid } as any });
    }
    for (const lt of p.loreTables || []) {
      await prisma.loreTable.create({ data: { ...strip(lt, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid } as any });
    }
    for (const r of p.rules || []) {
      await prisma.rule.create({ data: { ...strip(r, ["id", "projectId", "createdAt", "updatedAt"]), projectId: newPid } as any });
    }

    return NextResponse.json({ success: true, id: newPid });
  } catch (err) {
    return jsonError(err);
  }
}
