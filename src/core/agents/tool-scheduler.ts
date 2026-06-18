/**
 * 工具依赖图调度引擎
 *
 * 给一组工具名，自动分析依赖关系：
 *   阶段1: 并行执行所有无依赖的只读查询
 *   阶段2: 串行执行有依赖关系的工具（等阶段1出结果后）
 *
 * 21 个工具中 18 个无依赖（可直接并行），3 个有数据依赖。
 * 不调 LLM——纯拓扑排序 + Promise.all。
 */

import type { ToolSchema, ToolContext } from "./tool-registry";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface ScheduledCall {
  toolName: string;
  args: Record<string, unknown>;
  /** 依赖的工具名列表——这些工具必须先执行完毕 */
  dependsOn: string[];
}

export interface ScheduleResult {
  /** 所有工具的执行结果，key = toolName */
  results: Map<string, { success: boolean; data: unknown; error?: string }>;
  /** 总耗时 ms */
  elapsedMs: number;
  /** 每个阶段的工具名 */
  phases: string[][];
}

// ═══════════════════════════════════════════
// 依赖图定义
// ═══════════════════════════════════════════

/**
 * 各工具的依赖声明。
 * chapter_generate 需要先知道角色/大纲/世界书才能写好 prompt。
 * analyze_chapter / analyze_relationships 需要先有章节内容。
 */
const DEPENDENCY_GRAPH: Record<string, string[]> = {
  // 正文生成依赖大纲+角色+世界书+伏笔信息
  chapter_generate: ["outline_list", "character_list", "lore_list", "foreshadowing_list"],

  // 章节分析依赖章节内容
  analyze_chapter: ["chapter_get"],

  // 关系分析依赖章节列表
  analyze_relationships: ["chapter_get"],

  // 关系同步依赖章节内容
  relation_sync: ["chapter_get"],

  // 其他的全是独立查询，无依赖
};

// ═══════════════════════════════════════════
// 拓扑排序
// ═══════════════════════════════════════════

/**
 * 按依赖关系拓扑排序，返回执行阶段列表。
 * 每个阶段内的工具可安全并行。
 */
function toposort(calls: ScheduledCall[]): string[][] {
  const toolNames = calls.map((c) => c.toolName);
  const toolSet = new Set(toolNames);

  // 构建邻接表：A 依赖 B → B 必须在 A 之前
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // B → 谁依赖 B

  for (const call of calls) {
    if (!inDegree.has(call.toolName)) inDegree.set(call.toolName, 0);
    for (const dep of call.dependsOn) {
      // 只关心本次调度中的依赖
      if (!toolSet.has(dep)) continue;
      inDegree.set(call.toolName, (inDegree.get(call.toolName) || 0) + 1);
      const list = dependents.get(dep) || [];
      list.push(call.toolName);
      dependents.set(dep, list);
    }
  }

  // 确保所有被依赖的工具也有入度记录（即使它们不在 calls 中）
  for (const call of calls) {
    for (const dep of call.dependsOn) {
      if (!inDegree.has(dep)) inDegree.set(dep, 0);
    }
  }

  const phases: string[][] = [];
  const completed = new Set<string>();

  while (completed.size < calls.length) {
    const phase: string[] = [];

    for (const call of calls) {
      if (completed.has(call.toolName)) continue;
      const degree = inDegree.get(call.toolName) || 0;
      if (degree === 0) {
        phase.push(call.toolName);
      }
    }

    if (phase.length === 0) {
      // 循环依赖或所有剩余工具都有未满足的依赖 → 剩余全部放入最后一阶段
      const remaining = calls.filter((c) => !completed.has(c.toolName)).map((c) => c.toolName);
      phases.push(remaining);
      break;
    }

    phases.push(phase);
    for (const name of phase) {
      completed.add(name);
      // 减少依赖此工具的其他工具的入度
      const deps = dependents.get(name) || [];
      for (const dep of deps) {
        inDegree.set(dep, Math.max(0, (inDegree.get(dep) || 0) - 1));
      }
    }
  }

  return phases;
}

// ═══════════════════════════════════════════
// 调度器
// ═══════════════════════════════════════════

/**
 * 按依赖图调度执行所有工具调用。
 *
 * @param calls        要调度的工具调用列表
 * @param schemas      工具 schema 列表（用于验证参数）
 * @param ctx          工具执行上下文
 * @param executeOne   执行单个工具的函数（来自 toolRegistry.execute）
 * @returns 执行结果
 */
export async function scheduleCalls(
  calls: ScheduledCall[],
  _schemas: ToolSchema[],
  ctx: ToolContext,
  executeOne: (name: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<{ success: boolean; data: unknown; error?: string }>,
): Promise<ScheduleResult> {
  const start = Date.now();
  const results = new Map<string, { success: boolean; data: unknown; error?: string }>();

  if (calls.length === 0) {
    return { results, elapsedMs: 0, phases: [] };
  }

  // 1. 拓扑排序
  const phases = toposort(calls);
  const callMap = new Map(calls.map((c) => [c.toolName, c]));

  // 2. 逐阶段执行
  for (const phase of phases) {
    // 阶段内并行
    const promises = phase.map(async (toolName) => {
      const call = callMap.get(toolName);
      if (!call) {
        results.set(toolName, { success: false, data: null, error: "调度错误：找不到工具定义" });
        return;
      }
      const result = await executeOne(toolName, call.args, ctx);
      results.set(toolName, { success: result.success, data: result.data, error: result.error });
    });

    await Promise.all(promises);
  }

  return {
    results,
    elapsedMs: Date.now() - start,
    phases,
  };
}

// ═══════════════════════════════════════════
// 快捷入口
// ═══════════════════════════════════════════

/**
 * 从工具名列表构建 ScheduledCall 数组，自动填入依赖信息。
 * 最常用的入口——只需要传工具名列表。
 */
export function buildScheduledCalls(
  toolNames: Array<{ name: string; args: Record<string, unknown> }>,
): ScheduledCall[] {
  return toolNames.map(({ name, args }) => ({
    toolName: name,
    args,
    dependsOn: DEPENDENCY_GRAPH[name] || [],
  }));
}
