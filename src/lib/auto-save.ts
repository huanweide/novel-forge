/**
 * 三层自动保存 · 本地草稿层（5.1 核心防丢）
 *
 * 设计目标：用户在正文区手动编辑时，即使没点「完成」、即使浏览器崩溃/断电，
 * 已敲的内容也不丢。分层：
 *   层1 LocalStorage 500ms 防抖 —— 本文件负责，断电不丢
 *   层2 Server 3s 防抖 PUT —— 由 CenterPanel 调用现有 /api/story/nodes/[id] PUT
 *   层3 手动 Ctrl+S / 点完成 —— 现有 saveInlineEdit 不变
 *
 * 本文件只做纯本地草稿读写 + 时间戳比对，零 React、零网络，便于单测。
 */

export interface LocalDraft {
  /** 正文纯文本 */
  content: string;
  /** 写入本地的时间戳（epoch ms），用于与服务端 updatedAt 比对判断是否更新 */
  savedAt: number;
}

const PREFIX = "nf-autosave-";

/** 草稿的 localStorage key（按节点隔离，避免串章） */
export function getDraftKey(nodeId: string): string {
  return `${PREFIX}${nodeId}`;
}

/** 层1：把当前正文写入 localStorage（500ms 防抖由调用方控制）。localStorage 禁用/写满时静默失败，不阻塞写作。 */
export function saveDraftLocal(nodeId: string, content: string): void {
  if (typeof window === "undefined") return;
  try {
    const draft: LocalDraft = { content, savedAt: Date.now() };
    window.localStorage.setItem(getDraftKey(nodeId), JSON.stringify(draft));
  } catch {
    /* 隐私模式 / 配额已满：本地兜底失败就失败，仍有 3s 后的服务端落库兜底 */
  }
}

/** 读出本地草稿；格式损坏 / 不存在返回 null */
export function getDraftLocal(nodeId: string): LocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(nodeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof parsed.content !== "string" || typeof parsed.savedAt !== "number") return null;
    return { content: parsed.content, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** 清除本地草稿（成功落库 / 用户主动忽略恢复时调用） */
export function clearDraftLocal(nodeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(nodeId));
  } catch {
    /* ignore */
  }
}

/**
 * 判断本地草稿是否比服务端版本更新 —— 崩溃恢复提示的依据。
 * - draft 为空 → false（没东西可恢复）
 * - 服务端无时间 → true（默认本地更可信）
 * - 解析失败的服务端时间 → true（宁可提示，不丢用户内容）
 * - 否则比时间戳
 */
export function isDraftNewer(draft: LocalDraft | null, serverUpdatedAt?: string | null): boolean {
  if (!draft) return false;
  if (!serverUpdatedAt) return true;
  const serverTs = Date.parse(serverUpdatedAt);
  if (isNaN(serverTs)) return true;
  return draft.savedAt > serverTs;
}
