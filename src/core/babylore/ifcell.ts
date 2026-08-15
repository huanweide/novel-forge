// src/core/babylore/ifcell.ts
// 宝宝流「分阶段人设 / 剧情推进」求值器
// 解析参考资料风格的 <if cell="表/行/列 <= 阈值">...</if> 语法，
// 根据当前结构化表格的真实数值，选出"当前激活的分支"纯文本，
// 让角色人设随剧情进展（填表驱动的数值）自动切换并注入写作指令。
//
// 语法示例（可任意嵌套 <else><if cell=...>）：
//   <if cell="属性表/苏苏/好感度 <= 10">
//   阶段一：陌生人（态度：礼貌但疏离）
//   <else>
//   <if cell="属性表/苏苏/好感度 <= 30">
//   阶段二：熟悉的人（态度：愿意聊天）
//   ...
//   </if>
//   </if>

export interface IfCellTable {
  name?: string | null;
  key?: string | null;
  columns?: { key: string; label?: string }[];
  rows?: Record<string, unknown>[];
}

const OPS: Record<string, (a: number, b: number) => boolean> = {
  "<=": (a, b) => a <= b,
  "<": (a, b) => a < b,
  ">=": (a, b) => a >= b,
  ">": (a, b) => a > b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
};

/**
 * 对外入口：若 content 含 <if cell 语法则求值，否则原样返回。
 */
export function evaluateIfCell(content: string, tables: IfCellTable[]): string {
  if (!content || !content.includes("<if cell")) return content || "";
  try {
    return evalBlock(content, tables).trim();
  } catch {
    // 解析失败降级为原文，保证不阻断写作
    return content;
  }
}

/** 递归求值一个块（可能以 <if cell 开头，也可能只是纯文本） */
function evalBlock(s: string, tables: IfCellTable[]): string {
  const m = s.match(/^\s*<if cell="([^"]*)">([\s\S]*)$/);
  if (!m) return stripTags(s);
  const expr = m[1];
  const rest = m[2]; // then 内容 + <else> + </if>
  const { thenPart, elsePart } = splitThenElse(rest);
  const r = evalExpr(expr, tables);
  if (r === true) return evalBlock(thenPart, tables);
  if (r === false) return elsePart !== null ? evalBlock(elsePart, tables) : "";
  // r === null：无法求值（表/行/列缺失或值非数字）。
  // 不应误判为某一阶段，返回全部阶段参考文本（剥离标签、并列展示）。
  return stripTags(s);
}

/** 在 rest 中找出与开头 <if 配对的 </if>，并切分 then / else 两部分 */
function splitThenElse(rest: string): { thenPart: string; elsePart: string | null } {
  let depth = 1;
  let i = 0;
  let elseIdx = -1;
  let pairEnd = -1;
  while (i < rest.length && depth > 0) {
    if (rest.startsWith("<if", i)) {
      depth++;
      i += 3;
    } else if (rest.startsWith("</if>", i)) {
      depth--;
      if (depth === 0) pairEnd = i;
      i += 4;
    } else if (rest.startsWith("<else>", i)) {
      if (depth === 1 && elseIdx < 0) elseIdx = i;
      i += 6;
    } else {
      i++;
    }
  }
  if (pairEnd < 0) pairEnd = rest.length;
  const thenPart = elseIdx >= 0 ? rest.slice(0, elseIdx).trim() : rest.slice(0, pairEnd).trim();
  const elsePart = elseIdx >= 0 ? rest.slice(elseIdx + 6, pairEnd).trim() : null;
  return { thenPart, elsePart };
}

/** 求值单个条件表达式：表/行/列 操作符 数值。返回 null 表示无法求值（数据缺失） */
function evalExpr(expr: string, tables: IfCellTable[]): boolean | null {
  const segs = expr.split("/");
  if (segs.length < 3) return null;
  const tableName = segs[0].trim();
  const rowKey = segs[1].trim();
  const colPart = segs.slice(2).join("/").trim();
  const mm = colPart.match(/^(.+?)\s*(<=|>=|==|!=|<|>)\s*(.+)$/);
  if (!mm) return null;
  const colKey = mm[1].trim();
  const op = mm[2];
  const target = Number(mm[3].trim());
  if (Number.isNaN(target)) return null;

  const table = tables.find((t) => t.name === tableName || t.key === tableName);
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) return null;
  const row = table.rows.find(
    (r) => r.name === rowKey || Object.values(r).some((v) => String(v) === rowKey),
  );
  if (!row) return null;

  let val: any = row[colKey];
  if (val === undefined && Array.isArray(table.columns)) {
    const col = table.columns.find((c) => c.label === colKey);
    if (col) val = row[col.key];
  }
  if (val === undefined) return null;
  const num = Number(val);
  if (Number.isNaN(num)) return null;

  const fn = OPS[op];
  return fn ? fn(num, target) : null;
}

/** 清理残留标签（用于纯文本分支兜底） */
function stripTags(s: string): string {
  return s
    .replace(/<if cell="[^"]*">/g, "")
    .replace(/<\/?else>/g, "")
    .replace(/<\/?if>/g, "")
    .trim();
}
