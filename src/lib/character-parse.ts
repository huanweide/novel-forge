// 角色字段解析共享工具 —— 由 CharacterDialog（合并原 CharacterEditDialog / CharacterCreateDialog）抽取为单一数据源。
// 目的：避免「建角色」与「编角色」两个弹窗各自维护一份 personality / 时间线解析逻辑导致字段约定漂移。
// 解析规则与历史实现完全一致（主导/驱动/矛盾/习惯/面具 + 时间线 X岁：事件（时间参照））。

export interface CharacterRoleOption {
  value: string;
  label: string;
}

export const CHARACTER_ROLE_OPTIONS: CharacterRoleOption[] = [
  { value: "protagonist", label: "主角" },
  { value: "antagonist", label: "反派" },
  { value: "supporting", label: "配角" },
  { value: "mentor", label: "导师" },
  { value: "love_interest", label: "恋爱对象" },
  { value: "catalyst", label: "剧情催化剂" },
  { value: "background", label: "背景角色" },
];

export interface PersonalityParsed {
  dominant: string;
  drive: string;
  contradiction: string;
  habits: string[];
  socialMask: string;
}

// 文本 → 结构化性格（"主导：.../驱动：.../矛盾：.../习惯：...、.../面具：..."）
export function fromText(text: string): PersonalityParsed {
  const lines = (text || "").split("\n");
  let dominant = "", drive = "", contradiction = "", socialMask = "";
  const habits: string[] = [];
  for (const line of lines) {
    if (line.startsWith("主导：") || line.startsWith("主导:")) dominant = line.replace(/^主导[：:]\s*/, "").trim();
    else if (line.startsWith("驱动：") || line.startsWith("驱动:")) drive = line.replace(/^驱动[：:]\s*/, "").trim();
    else if (line.startsWith("矛盾：") || line.startsWith("矛盾:")) contradiction = line.replace(/^矛盾[：:]\s*/, "").trim();
    else if (line.startsWith("习惯：") || line.startsWith("习惯:"))
      habits.push(...line.replace(/^习惯[：:]\s*/, "").split(/[,，、]/).map((s) => s.trim()).filter(Boolean));
    else if (line.startsWith("面具：") || line.startsWith("面具:")) socialMask = line.replace(/^面具[：:]\s*/, "").trim();
    else if (line.trim()) {
      if (!dominant) dominant = line.trim();
      else habits.push(line.trim());
    }
  }
  return { dominant, drive, contradiction, habits, socialMask };
}

// 结构化性格 → 文本（与 fromText 互逆）
export function toText(p: unknown): string {
  if (typeof p === "object" && p !== null && !Array.isArray(p)) {
    const o = p as Record<string, unknown>;
    const lines: string[] = [];
    if (o.dominant) lines.push(`主导：${o.dominant}`);
    if (o.drive) lines.push(`驱动：${o.drive}`);
    if (o.contradiction) lines.push(`矛盾：${o.contradiction}`);
    if (Array.isArray(o.habits) && o.habits.length) lines.push(`习惯：${(o.habits as string[]).join("、")}`);
    if (o.socialMask) lines.push(`面具：${o.socialMask}`);
    return lines.join("\n") || "";
  }
  if (Array.isArray(p)) return (p as string[]).join("、");
  return String(p || "");
}

export interface CharacterTimelineEvent {
  age: number;
  event: string;
  era: string;
}

export function timelineToText(tl?: CharacterTimelineEvent[]): string {
  if (!tl || !tl.length) return "";
  return tl.map((t) => `${t.age}岁：${t.event}（${t.era}）`).join("\n");
}

export function textToTimeline(text: string): CharacterTimelineEvent[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+?)\s*[（(]([^)）]*)[)）]\s*$/);
      if (m) return { age: parseInt(m[1], 10), event: m[2].trim(), era: m[3].trim() };
      const m2 = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+)$/);
      if (m2) return { age: parseInt(m2[1], 10), event: m2[2].trim(), era: "" };
      return { age: 0, event: line.trim(), era: "" };
    });
}
