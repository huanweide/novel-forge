// 宝宝流数据库（Babylore）核心类型
// 结构化表格 + 自动填表(LLM填充) + 召回注入(剧情推进=记忆召回)

export type LoreColumnType = "text" | "number" | "select";

export interface LoreTableColumn {
  key: string; // 英文列标识，如 name
  label: string; // 中文列名，如 妃嫔名称
  type: LoreColumnType;
}

export interface LoreTableRow {
  row_id: number;
  [col: string]: unknown;
}

// 行操作协议——等价于宝宝流 SQL 模式（insert/update/delete），但用 JSON 在应用层落地，避免动态 SQL 注入
export type LoreTableOp =
  | { table: string; op: "insert"; values: Record<string, unknown> }
  | { table: string; op: "update"; match: { col: string; val: unknown }; values: Record<string, unknown> }
  | { table: string; op: "delete"; match: { col: string; val: unknown } };

export interface TableDef {
  id: string;
  key: string; // 表英文 key，如 woman_live
  name: string; // 表名
  note: string; // 表格说明
  category: string;
  columns: LoreTableColumn[];
  rows: LoreTableRow[];
}
