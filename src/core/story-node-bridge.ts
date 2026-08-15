// ============================================================
// StoryNode 桥接层 —— Prisma 返回 → 应用层强类型（v1.6.36 新增）
// ============================================================
// 诚实边界：Prisma schema 中 StoryNode.type / status 是 String、reviewLogs 是 Json；
// 而应用层 @/core/types 的 StoryNode.type 是 StoryNodeType 联合、status 是 ContentStatus 联合、
// reviewLogs 是 ReviewLog[]。此前在 continue 路由透传处写 currentNode: nextNode as any 是
// C 类（字段类型鸿沟，String 不赋联合）+ B 类（Json 列鸿沟）的散落绕过。
// 此处一次性集中桥接，下游透传不再散落 as any，且 type/status 访问在编译期真正被联合类型保护
// （未知枚举值带 fallback 兜底脏数据，不致类型崩溃）。

import type { StoryNode, StoryNodeType, ContentStatus, ReviewLog } from "@/core/types";
import type { StoryNode as PrismaStoryNode } from "@/generated/prisma/client";
import { NODE_TYPE } from "./node-type";

const STORY_NODE_TYPES: StoryNodeType[] = Object.values(NODE_TYPE);
const CONTENT_STATUSES: ContentStatus[] = [
  "outline_only", "drafting", "completed", "reviewing",
  "rejected", "revised", "pending_confirm", "confirmed",
];

/**
 * 把 Prisma 返回的 StoryNode（type/status 为 String、reviewLogs 为 Json）收窄为应用层强类型 StoryNode。
 * 仅桥接存在类型鸿沟的三个字段，其余字段（含 activeCharacters/activeLoreIds 已是 string[]）显式透传，
 * 避免对象展开带来的 Prisma 多余属性类型干扰。
 */
export function toAppStoryNode(raw: PrismaStoryNode): StoryNode {
  const type: StoryNodeType = (STORY_NODE_TYPES as string[]).includes(raw.type)
    ? (raw.type as StoryNodeType)
    : NODE_TYPE.SECTION;
  const status: ContentStatus = (CONTENT_STATUSES as string[]).includes(raw.status)
    ? (raw.status as ContentStatus)
    : "outline_only";
  // B 类鸿沟：Json 列返回 JsonValue，无法与 ReviewLog[] 直接双向断言，须经 unknown 桥接。
  // 此处用 as unknown as ReviewLog[]（比 as any 更诚实：明确承诺「此 JSON 即 ReviewLog[]」，且保留目标类型检查）。
  const reviewLogs: ReviewLog[] = Array.isArray(raw.reviewLogs)
    ? (raw.reviewLogs as unknown as ReviewLog[])
    : [];

  return {
    id: raw.id,
    projectId: raw.projectId,
    parentId: raw.parentId,
    type,
    title: raw.title,
    order: raw.order,
    status,
    outline: raw.outline,
    content: raw.content,
    wordCount: raw.wordCount,
    branchId: raw.branchId,
    isMainBranch: raw.isMainBranch,
    // activeCharacters / activeLoreIds 在 schema 中是 String[]，与应用层 string[] 一致，直接透传并兜底
    activeCharacters: Array.isArray(raw.activeCharacters) ? (raw.activeCharacters as string[]) : [],
    activeLoreIds: Array.isArray(raw.activeLoreIds) ? (raw.activeLoreIds as string[]) : [],
    coreConflict: raw.coreConflict,
    settingDescription: raw.settingDescription,
    notes: raw.notes,
    reviewLogs,
    revisionCount: raw.revisionCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    // 应用层接口 deletedAt?: Date | null；Prisma 可能返回 undefined（未映射默认值），统一兜底为 null
    deletedAt: raw.deletedAt ?? null,
  };
}
