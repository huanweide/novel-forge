/**
 * SSE 流式错误事件统一构造（v2.47 地基止血）
 *
 * 此前的 SSE 路由 catch 块一律发送硬编码的「服务器内部错误，请查看日志」，
 * 用户只能看到白屏/通用错误，无法判断是数据库没连、表没建还是网络问题。
 *
 * 本模块把已有的 classifyError（api-error.ts）收敛结果包成统一的 SSE error 事件，
 * 携带可读 content + 错误 code + 修复 hint，前端直接展示即可定位问题。
 *
 * 事件形状与既有 SSEEvent 兼容（type:"error" + content），并额外附加 code/hint 字段，
 * 旧消费者（只读 content）不受影响，新消费者可读 hint 给出可执行指引。
 */
import { classifyError } from "./api-error";

export interface SseErrorEvent {
  type: "error";
  content: string;
  code: string;
  hint?: string;
}

/**
 * 把任意异常（或一段现成文案）收敛为结构化 SSE error 事件。
 * - 传入字符串：视为生成期业务错误，原样作为 content，code 标记为 GENERATION。
 * - 传入 Error/unknown：走 classifyError，得到可读 content + code + hint。
 */
export function sseError(e: unknown): SseErrorEvent {
  if (typeof e === "string") {
    return {
      type: "error",
      content: e,
      code: "GENERATION",
      hint: "生成过程中出错，请查看服务端日志或重试。",
    };
  }
  const info = classifyError(e);
  return {
    type: "error",
    content: info.error,
    code: info.code,
    hint: info.hint,
  };
}
