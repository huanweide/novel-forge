// api_config 类预设的合并策略：白名单过滤 + 对象型子键深合并。
// 从原 apply 路由抽出，供「计划计算 / 执行 / 撤销」三处共用，避免策略分散各写一遍。

// N5：llmConfig 子键白名单——取「运行期实际消费的键 ∪ LLMConfig 接口规范键 ∪ 内置预设已知键」并集，
// 仅这些键允许进入 llmConfig，未知键一律丢弃，避免预设 content 摊平污染配置。
export const LLM_CONFIG_KEYS: ReadonlySet<string> = new Set([
  // 运行期 buildProjectOverrides 及生成端点实际读取的键
  "model", "baseUrl", "baseURL", "apiKey",
  "temperature", "defaultTemperature", "topP", "defaultTopP",
  "writerModel", "extractorModel", "povType",
  "dimensions", "styleTemplateId", "customStyleNotes", "customForbiddenPatterns",
  // LLMConfig 接口规范键
  "architectModel", "reviewerModel", "summarizeModel",
  "maxTokensPerRequest", "contextWindowSize", "fallbackModels",
  // 内置 api_config 示范预设使用的简写键（语义等同 maxTokensPerRequest）
  "maxTokens",
]);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// 按白名单逐层深合并：对象型子键递归合并，标量/数组直接覆盖，未知键丢弃。
export function deepMergeLLMConfig(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const key of Object.keys(incoming)) {
    if (!LLM_CONFIG_KEYS.has(key)) continue; // 剔除非配置键，杜绝污染
    const inc = incoming[key];
    const cur = current[key];
    if (isPlainObject(inc) && isPlainObject(cur)) {
      result[key] = deepMergeLLMConfig(cur, inc); // 仅对象型子键逐层深合并
    } else {
      result[key] = inc; // 标量/数组直接覆盖
    }
  }
  return result;
}

/**
 * 计算 api_config 套用「前」的可还原快照。
 * - values：本次会被覆盖、且原本已存在的键的旧值（撤销时写回）
 * - addedKeys：本次新增、原本不存在的白名单键（撤销时删除）
 */
export function snapshotLLMConfigBefore(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): { values: Record<string, unknown>; addedKeys: string[] } {
  const values: Record<string, unknown> = {};
  const addedKeys: string[] = [];
  for (const key of Object.keys(incoming)) {
    if (!LLM_CONFIG_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      values[key] = current[key];
    } else {
      addedKeys.push(key);
    }
  }
  return { values, addedKeys };
}
