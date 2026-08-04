import { prisma } from "@/lib/prisma";
import { normalizeRelationships } from "@/lib/relations";
import { NextResponse } from "next/server";

// P2-②：.nfproject 还原可能含大量章节/词条，放宽函数执行时长上限（对照 import/commit 已设 300）
export const maxDuration = 300;

// 去掉会导致冲突的字段（让 Prisma 重新生成 id / 时间戳 / 关联）
function strip<T extends Record<string, any>>(o: T, keys: string[]): Record<string, any> {
  const c: Record<string, any> = { ...o };
  for (const k of keys) delete c[k];
  return c;
}

// POST /api/projects/import —— 从 .nfproject 备份包导入为新项目（id 全部重映射）
// body：备份 JSON；可选 include：["characters","lorebook","chapters","branches","storylines","style","tables","rules"]
// v0.46.58：支持只导入选中的设定（未列出的部分跳过）。
// P1-①：整段包裹 $transaction（失败自动 rollback，不留孤儿项目/半吊子记录）；
//       按 {projectId, source} 幂等去重，重复导入同一 .nfproject 返回已存在项目、不再成倍复制。

const IMPORT_SOURCE = "nfproject";

interface ImportSourceMeta {
  projectId: string;
  source: string;
  name: string;
  at: number;
}

export async function POST(request: Request) {
  // N2 修复：导入来源稳定标识，需在外层声明（catch 块也要用，try 内 const 不可见）
  let importSourceKey: string | null = null;
  try {
    const bundle = await request.json();
    const p = bundle?.project;
    if (!p || typeof p !== "object") {
      return NextResponse.json({ error: "备份文件格式不正确（缺少 project）" }, { status: 400 });
    }
    if (bundle.format !== "nfproject") {
      return NextResponse.json({ error: "不是有效的 .nfproject 备份文件" }, { status: 400 });
    }

    const include = Array.isArray(bundle.include) && bundle.include.length
      ? new Set(bundle.include as string[])
      : null; // null = 全量
    const want = (key: string) => (include === null || include.has(key));

    // 原始项目 id（来自备份），作为幂等去重键的一部分；缺失则无法去重，按新建处理
    const origId = typeof p.id === "string" && p.id ? p.id : null;

    // N2 修复：导入来源稳定标识，写入 Project.importSource（DB 唯一约束）。
    // 并发重复导入同一备份 → 唯一冲突 P2002 → 外层捕获后返回已存在项目（幂等）。
    // origId 缺失则无法去重，importSource 置 null（Postgres 多 null 不冲突），按新建处理。
    importSourceKey = origId ? `${IMPORT_SOURCE}:${origId}` : null;

    // ── 幂等去重已移入 $transaction 内（见下方事务开头），避免并发重导入竞态重复 ──

    // 在事务内创建项目本体 + 全部子表；任一失败自动回滚，不留孤儿
    // P1-③：显式放宽交互事务超时（默认仅 5s），避免大备份串行 await 整段回滚
    // P1-④：幂等查重移入事务内（SQLite 写事务串行化），并发相同备份不再重复 insert
    const importResult = await prisma.$transaction(async (tx) => {
      // 幂等去重：相同 importSource 已导入过，则直接返回已存在项目，避免成倍复制
      // N2 修复：改用 Project.importSource 唯一字段查询（与 DB 唯一约束一致），移入事务内以杜绝并发重导入的 TOCTOU 竞态
      if (importSourceKey) {
        const existing = await tx.project.findUnique({
          where: { importSource: importSourceKey },
          select: { id: true },
        });
        if (existing) return { pid: existing.id, idempotent: true, lostForks: [] as string[] };
      }

      // 1. 项目本体
      const projData = strip(p, [
        "id", "createdAt", "updatedAt", "deletedAt",
        "characters", "lorebookEntries", "storyNodes", "storyBranches",
        "storylines", "styleCards", "loreTables", "rules",
      ]);
      projData.name = (projData.name || "导入的项目") + "（导入）";
      // 记录导入来源，供幂等去重（不改动业务字段语义）。
      // N2 修复：同时写入 buildConfig.importSource（保留既有追踪语义）与顶层 importSource（DB 唯一约束，并发幂等）。
      projData.buildConfig = {
        ...(typeof p.buildConfig === "object" && p.buildConfig ? p.buildConfig : {}),
        importSource: { projectId: origId, source: IMPORT_SOURCE, name: p.name || "", at: Date.now() },
      };
      // importSource 顶层字段：唯一约束幂等键；origId 缺失时为 null（多 null 不冲突，按新建处理）
      projData.importSource = importSourceKey;

      const created = await tx.project.create({ data: projData as any });
      const pid = created.id;

      // 1.5 nodeMap 提前声明：分支创建时需引用（forkPointNodeId 占位），章节 pass 复用
      const nodeMap: Record<string, string> = {};

      // 2. 故事分支（id 重映射；forkPointNodeId 占位，待节点 pass 后回填重映射）
      const branchMap: Record<string, string> = {};
      const branchForkMap: Record<string, string> = {};
      const branchParentMap: Record<string, string | null> = {};
      const lostForks: string[] = [];
      if (want("branches")) {
        // Pass 1：创建全部分支。forkPointNodeId 为 required String 无默认值，必须给占位值，
        // 否则 Prisma 抛 Missing required value → 事务整体回滚 → 备份静默失败（G1 修复）。
        // 占位取 重映射节点id ?? 旧节点id ?? ""；parentBranchId 一并 strip，Pass 2 重映射（W1 修复悬空）。
        for (const b of p.storyBranches || []) {
          branchForkMap[b.id] = b.forkPointNodeId;
          branchParentMap[b.id] = b.parentBranchId ?? null;
          const cb = await tx.storyBranch.create({
            data: {
              ...strip(b, ["id", "projectId", "createdAt", "forkPointNodeId", "parentBranchId"]),
              projectId: pid,
              forkPointNodeId: nodeMap[b.forkPointNodeId] ?? b.forkPointNodeId ?? "",
            } as any,
          });
          branchMap[b.id] = cb.id;
        }
        // Pass 2：parentBranchId 重映射（此时 branchMap 已全部就绪，可跨序引用旧 id）
        for (const b of p.storyBranches || []) {
          const oldParent = branchParentMap[b.id];
          const newParent = oldParent ? (branchMap[oldParent] ?? null) : null;
          if (newParent) {
            await tx.storyBranch.update({
              where: { id: branchMap[b.id] },
              data: { parentBranchId: newParent } as any,
            });
          }
        }
      }

      // 3. 章节节点 pass1 创建（不带 parent/branch），pass2 回填 parentId/branchId
      if (want("chapters")) {
        for (const n of p.storyNodes || []) {
          const cn = await tx.storyNode.create({
            data: { ...strip(n, ["id", "projectId", "createdAt", "updatedAt", "parentId", "branchId"]), projectId: pid, revisionCount: 0 } as any,
          });
          nodeMap[n.id] = cn.id;
        }
        for (const n of p.storyNodes || []) {
          const upd: Record<string, any> = {};
          if (n.parentId && nodeMap[n.parentId]) upd.parentId = nodeMap[n.parentId];
          if (n.branchId && branchMap[n.branchId]) upd.branchId = branchMap[n.branchId];
          if (Object.keys(upd).length) {
            await tx.storyNode.update({ where: { id: nodeMap[n.id] }, data: upd });
          }
        }
      }

      // 3.5 回填分支分叉点 forkPointNodeId（旧节点 id → 新节点 id 重映射）
      // P1-①：分支在节点之前创建，此处 nodeMap 已就绪，恢复分叉关系拓扑
      // W1 修复：选择性仅导入 branches（未导入 chapters）时 nodeMap 为空，forkPoint 会静默丢失；
      //         改为显式标注丢失分支并将 forkPointNodeId 置 ""（不再保留悬空旧 id），回执给出提示。
      if (want("branches") && Object.keys(branchForkMap).length) {
        for (const b of p.storyBranches || []) {
          const oldFork = branchForkMap[b.id];
          if (oldFork && branchMap[b.id]) {
            if (nodeMap[oldFork]) {
              await tx.storyBranch.update({
                where: { id: branchMap[b.id] },
                data: { forkPointNodeId: nodeMap[oldFork] } as any,
              });
            } else {
              // 分叉点节点未被导入（未随章节一并导入，或备份缺失）→ 标注丢失，不静默丢弃
              lostForks.push(b.id);
              await tx.storyBranch.update({
                where: { id: branchMap[b.id] },
                data: { forkPointNodeId: "" } as any,
              });
            }
          }
        }
      }

      // 4. 世界书词条（parentId / relatedEntryIds 重映射）
      const loreMap: Record<string, string> = {};
      if (want("lorebook")) {
        for (const l of p.lorebookEntries || []) {
          const cl = await tx.lorebookEntry.create({
            data: { ...strip(l, ["id", "projectId", "createdAt", "updatedAt", "parentId", "relatedEntryIds"]), projectId: pid } as any,
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
            await tx.lorebookEntry.update({ where: { id: loreMap[l.id] }, data: upd });
          }
        }
      }

      // 5. 其余扁平子表
      if (want("characters")) {
        for (const c of p.characters || []) {
          await tx.characterCard.create({
            data: {
              ...strip(c, ["id", "projectId", "createdAt", "updatedAt"]),
              relationships: normalizeRelationships((c as any).relationships),
              projectId: pid,
            } as any,
          });
        }
      }
      if (want("storylines")) {
        for (const s of p.storylines || []) {
          await tx.storyline.create({ data: { ...strip(s, ["id", "projectId", "createdAt", "updatedAt"]), projectId: pid } as any });
        }
      }
      if (want("style")) {
        for (const sc of p.styleCards || []) {
          await tx.styleCard.create({ data: { ...strip(sc, ["id", "projectId", "createdAt", "updatedAt"]), projectId: pid } as any });
        }
      }
      if (want("tables")) {
        for (const lt of p.loreTables || []) {
          await tx.loreTable.create({ data: { ...strip(lt, ["id", "projectId", "createdAt", "updatedAt"]), projectId: pid } as any });
        }
      }
      if (want("rules")) {
        for (const r of p.rules || []) {
          await tx.rule.create({ data: { ...strip(r, ["id", "projectId", "createdAt", "updatedAt"]), projectId: pid } as any });
        }
      }

      return { pid, idempotent: false, lostForks };
    }, { timeout: 120000 });

    // W1 修复：选择性仅导入 branches 时，分叉点可能因未导入章节而丢失，回执标注提示（不静默丢）
    const warnings = (importResult.lostForks && importResult.lostForks.length)
      ? `已导入，但 ${importResult.lostForks.length} 个分支的分叉点节点未随章节导入而丢失（分叉点需随章节一并导入）`
      : undefined;
    return NextResponse.json({ success: true, id: importResult.pid, idempotent: importResult.idempotent, warnings });
  } catch (err) {
    // N2 修复：并发重复导入同一备份时，事务内查重存在 TOCTOU 窗口（READ COMMITTED 下两事务可能同时通过查重），
    // 此时 tx.project.create 写入 importSource 触发 Postgres 唯一约束冲突（P2002）。
    // 捕获后查回已存在项目，按幂等返回（200 + idempotent:true），与事务内查重路径语义一致。
    const code = (err as any)?.code;
    if (code === "P2002" && importSourceKey) {
      try {
        const existing = await prisma.project.findUnique({
          where: { importSource: importSourceKey },
          select: { id: true },
        });
        if (existing) {
          return NextResponse.json({ success: true, id: existing.id, idempotent: true });
        }
      } catch (lookupErr) {
        console.error("[import] P2002 后查回已存在项目失败:", lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
      }
    }
    // P1-①：事务已自动 rollback，此处不再留孤儿；仅报错返回
    console.error("[import] 还原失败（已回滚）:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
