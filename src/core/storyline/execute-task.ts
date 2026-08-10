/**
 * 真后台 GenerationTask 执行器（v1.8.6, #174）。
 *
 * 设计：POST /api/generation-tasks 创建 pending 任务后立即返回 taskId，
 * 用「进程内 fire-and-forget」启动本执行器；任务在服务端进程里跑 LLM，
 * 与前端页面生命周期解耦——用户关掉页面，任务仍在服务端继续，稍后轮询即可拿结果。
 *
 * 局限：进程内异步在自托管 Node / dev 下稳定；serverless（如 Vercel 冷启动回收）
 * 不保证跑完。这是当前架构下的务实落地，后续可换持久队列。
 */

import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import {
  generateStorylineSuggestions,
  type GenCharacter,
  type GenExisting,
  type GenLore,
  type GenProject,
} from "./generate";

/** 从 DB 取出生成所需的项目上下文，并收敛成 generate.ts 的精简输入。 */
async function loadProjectContext(projectId: string) {
  const [project, characters, loreEntries, existingStorylines] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    getApprovedCharacters(prisma, projectId),
    getApprovedLore(prisma, projectId),
    prisma.storyline.findMany({ where: { projectId } }),
  ]);
  if (!project) throw new Error("项目不存在");

  const ctx: {
    project: GenProject;
    characters: GenCharacter[];
    loreEntries: GenLore[];
    existingStorylines: GenExisting[];
  } = {
    project: {
      name: project.name,
      genre: project.genre,
      synopsis: project.synopsis,
      toneKeywords: project.toneKeywords,
      buildConfig: project.buildConfig as Record<string, unknown> | undefined,
    },
    characters: characters.map((c) => ({ name: c.name, role: c.role, background: c.background })),
    loreEntries: loreEntries.map((e) => ({ title: e.title, content: e.content, enabled: e.enabled })),
    existingStorylines: existingStorylines.map((s) => ({ type: s.type, title: s.title, status: s.status })),
  };
  return ctx;
}

/**
 * 执行单个生成任务：running → done（result 含 suggestions）或 failed（error）。
 * 任何异常都被捕获并写入 task，绝不抛出到调用方（fire-and-forget 无人 await）。
 */
export async function runStorylineGenerationTask(taskId: string): Promise<void> {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: { status: "running", progress: 10 },
  });

  try {
    const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
    if (!task) return; // 任务已被删，静默退出

    const ctx = await loadProjectContext(task.projectId);
    const style = (ctx.project.buildConfig?.storylineStyle as string) || "creative";
    const suggestions = await generateStorylineSuggestions({
      ...ctx,
      mode: "auto",
      style,
      extra: task.prompt || undefined,
    });

    await prisma.generationTask.update({
      where: { id: taskId },
      data: { status: "done", progress: 100, result: { suggestions } as object },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { status: "failed", error: message },
    });
  }
}
