/**
 * 生成失败提示可读化（前端）
 *
 * 后端 `src/lib/api-error.ts` 已经把 Prisma / LLM 的原始异常收敛成
 * `{ error, hint }` 的中文提示，但前端有两条路径此前拿不到、也没展示：
 *
 *   1. HTTP 非 2xx：生成接口直接返回 500 JSON，前端却照样去读 SSE 流，
 *      读到的内容不是 `data: ` 格式而被逐行跳过 —— 用户零反馈。
 *   2. 网络层异常：fetch 本身失败（服务没起 / 断网 / 超时），
 *      只 console.error 打进控制台，界面上什么都不说。
 *
 * 本模块把这两种失败翻译成「人话 + 下一步怎么办」，让非技术用户
 * （本项目主要服务对象：靠小说赚钱的创作者）知道发生了什么、该点哪里。
 */

export interface StreamFailure {
  /** 人话标题，如「连不上本地服务」 */
  title: string;
  /** 具体说明 + 解决建议，会作为 toast 正文展示 */
  description: string;
}

/** 服务端 jsonError 返回的响应体形状 */
interface ApiErrorPayload {
  error?: unknown;
  hint?: unknown;
  code?: unknown;
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * 网络层异常 → 人话。
 *
 * @returns 失败描述；返回 `null` 表示「用户主动中止」，无需打扰用户。
 */
export function describeStreamError(err: unknown): StreamFailure | null {
  // 用户点了「停止生成」——这是预期行为，不提示
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError") return null;

  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = msg.toLowerCase();

  // fetch 失败在浏览器里一律是 TypeError: Failed to fetch
  // （含：本地服务没起、断网、DNS 挂了、被代理 / 防火墙拦了）
  if (
    err instanceof TypeError ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("failed to load resource")
  ) {
    return {
      title: "连不上服务",
      description:
        "生成请求没发出去。如果你是在本地使用，请确认服务还在运行（默认 http://localhost:3001）；如果用的是线上地址，请检查网络后重试。",
    };
  }

  if (lower.includes("timeout") || lower.includes("超时") || lower.includes("etimedout")) {
    return {
      title: "生成超时",
      description: "这次请求等太久没响应，可能是模型正忙或网络较慢。稍等一会儿重试即可，正文不会丢。",
    };
  }

  if (msg.includes("无法获取响应流")) {
    return {
      title: "服务没返回内容",
      description: "生成接口没有返回可读取的数据流，请重试；若反复出现，请重启本地服务。",
    };
  }

  // 兜底：至少把原始信息说出来，别让界面沉默
  return {
    title: "生成失败",
    description: msg ? `${msg}（可重试；若反复失败请查看服务日志）` : "生成过程中出错，请重试。",
  };
}

/**
 * HTTP 非 2xx → 人话。
 *
 * 优先采用服务端 `jsonError` 已经写好的中文（更贴近真实原因），
 * 服务端没给时再按状态码兜底。
 */
export function describeHttpError(status: number, payload: unknown): StreamFailure {
  const body = (payload && typeof payload === "object" ? payload : {}) as ApiErrorPayload;
  const serverError = asNonEmptyString(body.error);
  const serverHint = asNonEmptyString(body.hint);

  // 服务端已经说清了，直接转述（这是最准确的情况）
  if (serverError) {
    return {
      title: "生成失败",
      description: serverHint ? `${serverError}　${serverHint}` : serverError,
    };
  }

  // 服务端没给结构化错误，按状态码给出可操作建议
  switch (status) {
    case 400:
      return {
        title: "请求有误",
        description: "这次生成请求的参数不完整或格式不对。请换一章、或调整一下作者笔记后重试。",
      };
    case 401:
    case 403:
      return {
        title: "接口密钥无效",
        description: "大模型接口拒绝了这次请求（通常是 API Key 无效或已过期）。请到「设置」里检查并重新填写 Key。",
      };
    case 402:
      return {
        title: "账户余额不足",
        description: "大模型账户余额不够了，充值后即可继续生成。",
      };
    case 404:
      return {
        title: "接口不存在",
        description: "找不到生成接口，可能是版本不匹配。请刷新页面；本地使用请重启服务。",
      };
    case 408:
      return {
        title: "生成超时",
        description: "服务端等待太久，请稍后重试。",
      };
    case 429:
      return {
        title: "请求太频繁",
        description: "已达模型调用频率上限（或并发太多）。稍等一两分钟再试，正文不会丢。",
      };
    case 502:
    case 503:
    case 504:
      return {
        title: "服务暂时不可用",
        description: "生成服务没有正常响应（可能是模型服务繁忙或本地服务刚重启）。请稍后重试。",
      };
    default:
      return {
        title: "生成失败",
        description: `服务返回了异常状态（HTTP ${status}）。请重试；若反复出现请查看服务日志。`,
      };
  }
}
