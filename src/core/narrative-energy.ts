import { prisma } from "@/lib/prisma";

/**
 * 叙事能量曲线（叙事物理引擎雏形 · P1 · 智能体团队计划书）
 *
 * 真问题不是「写得快慢」，而是「张力有没有起伏」。把叙事张力当成守恒量，
 * 给作者一条可量化、可对照的「能量曲线」：哪章是高潮、哪章是低谷、整体节奏
 * 是否平直或虎头蛇尾。
 *
 * 设计原则（第一性原理 + 先粗粒度）：
 *  - 零新增 schema 字段——ChapterSummary.eventImportances 已有 S/A/B/C 四级事件
 *    分层、keyEvents 提供事件密度，天然是「能量种子」。
 *  - 零 LLM 调用——纯确定性启发式聚合，可单测、永不超时、成本为零。
 *  - 容错：eventImportances 可能是 string/object/缺字段；一章多条摘要取最新；
 *    缺失 StoryNode 顺序的章节按 createdAt 兜底；整段 try/catch 返回空结构。
 */

export interface NarrativeEnergyPoint {
  chapterId: string;
  chapterTitle: string;
  index: number; // 0-based 章节顺序
  energy: number; // [0,1] 归一化能量
  raw: number; // 归一化前的原始能量（供诊断与后续调参）
}

export interface NarrativeEnergyDiagnosis {
  chapterCount: number;
  avgEnergy: number;
  peak: { index: number; chapterTitle: string; energy: number } | null;
  valley: { index: number; chapterTitle: string; energy: number } | null;
  variance: number;
  advice: string[];
}

export interface NarrativeEnergyResult {
  points: NarrativeEnergyPoint[];
  diagnosis: NarrativeEnergyDiagnosis;
}

// 事件重要性权重（S/A/B/C 四级 + keyEvents 密度）
const W = { s: 1.0, a: 0.7, b: 0.4, c: 0.15, e: 0.05 };
// 归一化上限：原始能量到此即视为满格（≈ 1 个 S + 2 个 A + 3 个 B 量级）
const NORM = 3.0;

function parseTiers(v: unknown): { s: number; a: number; b: number; c: number } {
  let obj: any = v;
  if (typeof v === "string") {
    try {
      obj = JSON.parse(v);
    } catch {
      obj = {};
    }
  }
  if (!obj || typeof obj !== "object") obj = {};
  const len = (x: unknown) =>
    Array.isArray(x) ? x.length : typeof x === "string" && x.trim() ? 1 : 0;
  return {
    s: len(obj?.sTier),
    a: len(obj?.aTier),
    b: len(obj?.bTier),
    c: len(obj?.cTier),
  };
}

function computeRaw(
  tiers: { s: number; a: number; b: number; c: number },
  keyEventsLen: number,
): number {
  return (
    tiers.s * W.s +
    tiers.a * W.a +
    tiers.b * W.b +
    tiers.c * W.c +
    keyEventsLen * W.e
  );
}

/**
 * 计算某项目全部章节的叙事能量曲线（只读聚合，无副作用）。
 */
export async function computeNarrativeEnergy(
  projectId: string,
): Promise<NarrativeEnergyResult> {
  try {
    // 1) 章节顺序：StoryNode(type=chapter) 按 order 排序，建立 id → 序号
    const chapters = await prisma.storyNode.findMany({
      where: { projectId, type: "chapter", deletedAt: null },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const orderMap = new Map<string, number>();
    chapters.forEach((c, i) => orderMap.set(c.id, i));
    const maxOrder = chapters.length;

    // 2) 摘要：按 chapterId 去重，每章取最新 createdAt 的一条
    const summaries = await prisma.chapterSummary.findMany({
      where: { projectId },
      select: {
        chapterId: true,
        chapterTitle: true,
        keyEvents: true,
        eventImportances: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const latestByChapter = new Map<string, (typeof summaries)[number]>();
    for (const s of summaries) {
      if (!s.chapterId) continue;
      if (!latestByChapter.has(s.chapterId)) latestByChapter.set(s.chapterId, s);
    }

    // 3) 排序：有 StoryNode 顺序的按 order 排，否则按 createdAt 兜底排最后
    const ordered = Array.from(latestByChapter.values()).sort((a, b) => {
      const oa = orderMap.has(a.chapterId) ? orderMap.get(a.chapterId)! : maxOrder;
      const ob = orderMap.has(b.chapterId) ? orderMap.get(b.chapterId)! : maxOrder;
      if (oa !== ob) return oa - ob;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const points: NarrativeEnergyPoint[] = ordered.map((s, i) => {
      const tiers = parseTiers(s.eventImportances);
      const keyLen = Array.isArray(s.keyEvents)
        ? (s.keyEvents as string[]).length
        : 0;
      const raw = computeRaw(tiers, keyLen);
      const energy = Math.max(0, Math.min(1, raw / NORM));
      return {
        chapterId: s.chapterId,
        chapterTitle: s.chapterTitle || `第${i + 1}章`,
        index: i,
        energy: Number(energy.toFixed(3)),
        raw: Number(raw.toFixed(3)),
      };
    });

    return { points, diagnosis: diagnose(points) };
  } catch {
    return {
      points: [],
      diagnosis: {
        chapterCount: 0,
        avgEnergy: 0,
        peak: null,
        valley: null,
        variance: 0,
        advice: [],
      },
    };
  }
}

function diagnose(points: NarrativeEnergyPoint[]): NarrativeEnergyDiagnosis {
  const n = points.length;
  if (n === 0) {
    return {
      chapterCount: 0,
      avgEnergy: 0,
      peak: null,
      valley: null,
      variance: 0,
      advice: [],
    };
  }
  const energies = points.map((p) => p.energy);
  const avg = energies.reduce((a, b) => a + b, 0) / n;

  let peakIdx = 0;
  let valleyIdx = 0;
  energies.forEach((e, i) => {
    if (e > energies[peakIdx]) peakIdx = i;
    if (e < energies[valleyIdx]) valleyIdx = i;
  });

  const variance = energies.reduce((a, e) => a + (e - avg) ** 2, 0) / n;

  const peak = {
    index: peakIdx,
    chapterTitle: points[peakIdx].chapterTitle,
    energy: points[peakIdx].energy,
  };
  const valley = {
    index: valleyIdx,
    chapterTitle: points[valleyIdx].chapterTitle,
    energy: points[valleyIdx].energy,
  };

  const advice: string[] = [];

  if (n < 3) {
    advice.push("章节摘要不足 3 章，能量曲线样本偏少，建议积累更多章节后再评估节奏。");
  }

  // 首末趋势
  const first = energies[0];
  const last = energies[n - 1];
  if (n >= 3) {
    if (last < first - 0.2) {
      advice.push(
        `收尾张力下滑（首章 ${first.toFixed(2)} → 末章 ${last.toFixed(2)}），检查后期是否铺垫不足或高潮后劲不够。`,
      );
    } else if (last > first + 0.2) {
      advice.push("开篇蓄力、后期爆发，整体张力走向向好，可保持。");
    }
  }

  // 峰谷落差
  const swing = peak.energy - valley.energy;
  if (n >= 4) {
    if (swing < 0.15) {
      advice.push(
        "张力起伏过平（峰谷差 < 0.15），整体缺少高潮与低谷的对比，建议在过渡章穿插转折或冲突。",
      );
    } else if (swing > 0.5) {
      advice.push(
        `张力起落强烈（峰谷差 ${swing.toFixed(2)}），节奏感好；可检查低谷章「${valley.chapterTitle}」是否需要更多情绪缓冲。`,
      );
    }
  }

  // 连续下降段
  let maxDrop = 0;
  let dropLen = 0;
  let curDrop = 0;
  let curLen = 0;
  for (let i = 1; i < n; i++) {
    if (energies[i] < energies[i - 1]) {
      curDrop += energies[i - 1] - energies[i];
      curLen += 1;
      if (curLen > dropLen) {
        dropLen = curLen;
        maxDrop = curDrop;
      }
    } else {
      curDrop = 0;
      curLen = 0;
    }
  }
  if (dropLen >= 3 && maxDrop > 0.4) {
    advice.push(
      `存在连续 ${dropLen} 章走低的段落（累计下降 ${maxDrop.toFixed(2)}），可能带来读者流失风险，考虑插入小高潮打断。`,
    );
  }

  // 长时间平台
  let maxPlat = 0;
  let curPlat = 1;
  for (let i = 1; i < n; i++) {
    if (Math.abs(energies[i] - energies[i - 1]) < 0.05) {
      curPlat += 1;
      if (curPlat > maxPlat) maxPlat = curPlat;
    } else {
      curPlat = 1;
    }
  }
  if (maxPlat >= 4) {
    advice.push(
      `存在约 ${maxPlat} 章的平缓平台，张力长期不动，可用新事件或揭示打破单调。`,
    );
  }

  if (advice.length === 0) {
    advice.push("节奏起伏健康，张力分布均衡，暂无显著失衡。");
  }

  return {
    chapterCount: n,
    avgEnergy: Number(avg.toFixed(3)),
    peak,
    valley,
    variance: Number(variance.toFixed(4)),
    advice,
  };
}
