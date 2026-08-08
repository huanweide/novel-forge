// v1.6.22 待审隔离根因修复——单一事实来源（Single Source of Truth）。
//
// 背景：v1.6.13~1.6.21 的待审隔离靠「每个取用端手写 where.reviewStatus:approved」实现，
// 属于散布式手动过滤。只要有一个端点漏写，pending 待审卡就会泄漏进生成上下文。
// 这条漏洞在七轮循环里反复撕开（context-loader / sync-global-prompt / 16 个生成入口）。
//
// 根因修复：把所有「取用 approved 卡」的逻辑收敛到这两个 helper。任何生成 / LLM 上下文
// 注入端点【必须】走这里，禁止在调用方手写道 reviewStatus（否则下一轮又会漏闸）。
// 负向门禁见 approved-cards.test.ts——钉死「helper 永远强制 approved 过滤」。

import type { PrismaClient, Prisma } from "@/generated/prisma/client";

export interface ApprovedCharactersOptions {
  where?: Prisma.CharacterCardWhereInput;
  select?: Prisma.CharacterCardSelect;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.CharacterCardOrderByWithRelationInput
    | Prisma.CharacterCardOrderByWithRelationInput[];
  include?: Prisma.CharacterCardInclude;
}

/**
 * 取用「作者已确认（approved）」的角色卡。
 * 铁律：只有 approved 卡能参与生成 / 上下文注入。
 * 调用方可在 opts.where 追加筛选（如 role / OR），会被安全合并——绝不会覆盖 projectId 与 reviewStatus。
 */
export async function getApprovedCharacters(
  prisma: PrismaClient,
  projectId: string,
  opts: ApprovedCharactersOptions = {},
) {
  const { where, ...rest } = opts;
  return prisma.characterCard.findMany({
    ...rest,
    where: { ...where, projectId, reviewStatus: "approved" },
  });
}

export interface ApprovedLoreOptions {
  where?: Prisma.LorebookEntryWhereInput;
  select?: Prisma.LorebookEntrySelect;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.LorebookEntryOrderByWithRelationInput
    | Prisma.LorebookEntryOrderByWithRelationInput[];
  include?: Prisma.LorebookEntryInclude;
  // 默认只返回启用（enabled:true）条目；管理类场景（如 lore_list enabled=false）传 true 取消约束。
  // 注意：无论是否取消 enabled 约束，reviewStatus:approved 始终强制——管理场景也只看已确认卡。
  includeDisabled?: boolean;
}

/**
 * 取用「作者已确认（approved）」且「已启用（enabled:true）」的世界书条目。
 * enabled:true 是生成场景的正确默认（禁用条目不应注入）；includeDisabled 仅用于显式管理视图。
 */
export async function getApprovedLore(
  prisma: PrismaClient,
  projectId: string,
  opts: ApprovedLoreOptions = {},
) {
  const { where, includeDisabled, ...rest } = opts;
  return prisma.lorebookEntry.findMany({
    ...rest,
    where: {
      ...where,
      projectId,
      reviewStatus: "approved",
      ...(includeDisabled ? {} : { enabled: true }),
    },
  });
}
