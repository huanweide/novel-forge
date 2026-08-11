/**
 * 写作 / 章纲指令的「上下文注入」尾部组装（v1.8.24 抽取）
 *
 * 把若干上下文块（长期记忆摘要、全书节奏阶段指令等）按数组顺序、以空行分隔追加到
 * 指令尾部。空块自动跳过，避免污染 prompt。write / refine / continue 三路由共用本函数，
 * 保证注入顺序一致（digest 在前、stage 在后），并且让这段拼装逻辑可被单测直接覆盖——
 * 此前它内联在三路由里、只能靠 grep + tsc 间接验证，现在有了真实的单测闸门。
 */

/**
 * 将上下文块按给定顺序追加到基准指令后。
 *
 * @param base   基准指令（如写作指令 / 章纲 prompt 主体）。
 * @param blocks 上下文块数组，依次追加；`null` / `undefined` / 空串自动跳过。
 * @returns 拼装后的指令。每个非空块前加 `"\n\n"` 与基准或上一块分隔。
 */
export function injectContextBlocks(
  base: string,
  blocks: (string | null | undefined)[],
): string {
  let result = base;
  for (const block of blocks) {
    // 空串与纯空白串都跳过，避免往 prompt 里塞空段落
    if (block && block.trim()) result += "\n\n" + block;
  }
  return result;
}
