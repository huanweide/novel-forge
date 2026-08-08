/**
 * 项目自检引擎（v1.6.25 自我检测 UI 核心）
 *
 * 在「项目设置 → 自检」一键跑一组健康检查，返回结构化报告。
 * 每项检查独立 try/catch，单点失败不拖垮整体；状态分 ok / warn / error。
 * 纯逻辑、可单测（mock prisma + getSettings 即可）。
 */

import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/llm";

export type CheckStatus = "ok" | "warn" | "error";
export interface DiagnosticCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
export interface DiagnosticReport {
  generatedAt: string;
  projectId: string;
  projectName: string;
  overall: CheckStatus;
  checks: DiagnosticCheck[];
}

function worst(a: CheckStatus, b: CheckStatus): CheckStatus {
  const rank: Record<CheckStatus, number> = { ok: 0, warn: 1, error: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export async function runProjectDiagnostics(projectId: string): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    return {
      generatedAt: new Date().toISOString(),
      projectId,
      projectName: "",
      overall: "error",
      checks: [{ key: "projectExists", label: "项目存在性", status: "error", detail: "未找到该项目（id 无效或已删除）" }],
    };
  }

  // 1. 数据库连通性（能查到项目本身就说明 DB 可达，但这里显式计数确认）
  try {
    const c = await prisma.project.count();
    checks.push({ key: "dbReachable", label: "数据库连通", status: c >= 0 ? "ok" : "error", detail: `连接正常，项目总数 ${c}` });
  } catch (e) {
    checks.push({ key: "dbReachable", label: "数据库连通", status: "error", detail: `数据库查询失败：${e instanceof Error ? e.message : String(e)}` });
  }

  // 2. LLM 配置
  try {
    const s = await getSettings();
    const ok = !!s.baseUrl && !!s.apiKey && !!s.model;
    checks.push({
      key: "llmConfigured",
      label: "LLM 配置",
      status: ok ? "ok" : "error",
      detail: ok ? `已配置（${s.model} @ ${s.baseUrl}）` : "缺少 baseUrl / apiKey / model，生成将失败",
    });
  } catch (e) {
    checks.push({ key: "llmConfigured", label: "LLM 配置", status: "error", detail: `读取配置失败：${e instanceof Error ? e.message : String(e)}` });
  }

  // 3. 章节 / 角色 / 世界书 / 故事线 计数
  const [nodeCount, charCount, loreCount, storylineCount] = await Promise.all([
    prisma.storyNode.count({ where: { projectId, deletedAt: null } }),
    prisma.characterCard.count({ where: { projectId } }),
    prisma.lorebookEntry.count({ where: { projectId } }),
    prisma.storyline.count({ where: { projectId } }),
  ]);
  checks.push({
    key: "contentCounts",
    label: "内容规模",
    status: "ok",
    detail: `章节 ${nodeCount} · 角色 ${charCount} · 世界书 ${loreCount} · 故事线 ${storylineCount}`,
  });

  // 4. 软删除残留（回收站）
  const softDeleted = await prisma.storyNode.count({ where: { projectId, deletedAt: { not: null } } });
  checks.push({
    key: "softDeleted",
    label: "回收站残留",
    status: softDeleted > 0 ? "warn" : "ok",
    detail: softDeleted > 0 ? `${softDeleted} 个章节在回收站（可恢复或彻底删除）` : "无回收站残留",
  });

  // 5. 待审卡（不会注入生成）
  const pendingChars = await prisma.characterCard.count({ where: { projectId, reviewStatus: "pending" } });
  const pendingLore = await prisma.lorebookEntry.count({ where: { projectId, reviewStatus: "pending" } });
  const pendingTotal = pendingChars + pendingLore;
  checks.push({
    key: "pendingCards",
    label: "待审卡（不注入生成）",
    status: pendingTotal > 0 ? "warn" : "ok",
    detail: pendingTotal > 0 ? `${pendingTotal} 张待审（角色 ${pendingChars} · 世界书 ${pendingLore}），需逐张「确认并入」才会进入正文` : "无待审卡，全部已确认",
  });

  // 6. globalPrompt 缓存
  const gpLen = (project.globalPrompt || "").length;
  checks.push({
    key: "globalPrompt",
    label: "生成缓存（globalPrompt）",
    status: gpLen > 0 ? "ok" : "warn",
    detail: gpLen > 0 ? `已编译，约 ${gpLen} 字` : "为空——角色/世界书确认后需同步一次才会注入生成",
  });

  // 7. 重复角色名（去重提示）
  try {
    const names = await prisma.characterCard.findMany({ where: { projectId }, select: { name: true } });
    const lower = new Map<string, number>();
    for (const n of names) {
      const k = (n.name || "").trim().toLowerCase();
      if (!k) continue;
      lower.set(k, (lower.get(k) || 0) + 1);
    }
    const dups = [...lower.entries()].filter(([, v]) => v > 1).map(([k]) => k);
    checks.push({
      key: "duplicateNames",
      label: "重复角色名",
      status: dups.length > 0 ? "warn" : "ok",
      detail: dups.length > 0 ? `检测到 ${dups.length} 个重名角色：${dups.slice(0, 5).join("、")}${dups.length > 5 ? "…" : ""}（建议合并）` : "无重名角色",
    });
  } catch (e) {
    checks.push({ key: "duplicateNames", label: "重复角色名", status: "error", detail: `检测失败：${e instanceof Error ? e.message : String(e)}` });
  }

  const overall = checks.reduce<CheckStatus>((acc, c) => worst(acc, c.status), "ok");
  return {
    generatedAt: new Date().toISOString(),
    projectId,
    projectName: project.name,
    overall,
    checks,
  };
}
