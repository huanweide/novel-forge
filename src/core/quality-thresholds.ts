// 质量护栏单一阈值真相：所有确认/评分路径共享的常量源（Max Loop Round2）
// 消除 analyzer 内部硬编码 60 与 confirm-guard 的软分裂；本文件零依赖，可被任意层引用。
export const QUALITY_PASS_THRESHOLD = 60;
