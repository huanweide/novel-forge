/**
 * rules 纯逻辑单测（魔王循环 v2.5.0）
 * 覆盖：规则冲突检测（语义相反/实体重叠/跨类不冲突）、三阶段裁决（优先级→特异性→创建时间）、
 * 规则注入到作者注（空规则直返、分类分组、被否决标记、冲突裁决记录、作者指令拼接）。
 * detectConflicts / injectRules 为纯函数；vi.mock prisma 隔离顶层 import。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  detectConflicts,
  injectRules,
  type RuleRecord,
} from "./rules";

function mkRule(
  partial: Partial<RuleRecord> & Pick<RuleRecord, "id" | "name" | "content" | "category">,
): RuleRecord {
  return {
    enabled: true,
    priority: 5,
    scope: "all",
    ...partial,
  } as RuleRecord;
}

describe("detectConflicts - 冲突检测", () => {
  it("空规则 → 无冲突", () => {
    expect(detectConflicts([])).toHaveLength(0);
  });

  it("同分类语义相反（禁止 vs 必须）→ 检测到冲突", () => {
    const a = mkRule({ id: "a", name: "不伤主角", content: "禁止伤害主角", category: "writing", priority: 10 });
    const b = mkRule({ id: "b", name: "护主角", content: "必须保护主角", category: "writing", priority: 5 });
    const conflicts = detectConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].winner.id).toBe("a"); // 优先级高者胜
    expect(conflicts[0].resolution).toBe("keep_higher_priority");
  });

  it("同分类但都正向 → 不冲突", () => {
    const a = mkRule({ id: "a", name: "护主角", content: "必须保护主角", category: "writing" });
    const b = mkRule({ id: "b", name: "护配角", content: "必须爱护配角", category: "writing" });
    expect(detectConflicts([a, b])).toHaveLength(0);
  });

  it("不同分类 → 不冲突", () => {
    const a = mkRule({ id: "a", name: "不伤主角", content: "禁止伤害主角", category: "writing" });
    const b = mkRule({ id: "b", name: "护主角", content: "必须保护主角", category: "world" });
    expect(detectConflicts([a, b])).toHaveLength(0);
  });

  it("实体重叠（引号内同名实体）但语义非相反 → 仍判冲突", () => {
    const a = mkRule({ id: "a", name: "李雷内向", content: "角色「李雷」沉默寡言", category: "character" });
    const b = mkRule({ id: "b", name: "李雷外向", content: "角色「李雷」活泼开朗", category: "character" });
    const conflicts = detectConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toContain("目标重叠");
  });
});

describe("detectConflicts - 三阶段裁决", () => {
  it("阶段1：优先级高者胜", () => {
    const a = mkRule({ id: "a", name: "A", content: "禁止X", category: "writing", priority: 10 });
    const b = mkRule({ id: "b", name: "B", content: "必须X", category: "writing", priority: 5 });
    expect(detectConflicts([a, b])[0].winner.id).toBe("a");
  });

  it("阶段2：优先级相同、特异性高者胜", () => {
    const a = mkRule({ id: "a", name: "A", content: "禁止X", category: "writing", priority: 5, specificityScore: 2 });
    const b = mkRule({ id: "b", name: "B", content: "必须X", category: "writing", priority: 5, specificityScore: 5 });
    const c = detectConflicts([a, b])[0];
    expect(c.winner.id).toBe("b");
    expect(c.resolution).toBe("keep_higher_specificity");
  });

  it("阶段3：优先级与特异性都相同、创建早者胜（先到先得）", () => {
    const early = new Date("2026-01-01").getTime();
    const late = new Date("2026-06-01").getTime();
    const a = mkRule({ id: "a", name: "A", content: "禁止X", category: "writing", priority: 5, createdAt: new Date(early) });
    const b = mkRule({ id: "b", name: "B", content: "必须X", category: "writing", priority: 5, createdAt: new Date(late) });
    const c = detectConflicts([a, b])[0];
    expect(c.winner.id).toBe("a");
    expect(c.resolution).toBe("keep_older");
  });
});

describe("injectRules - 注入到作者注", () => {
  it("空规则 → 原样返回 authorNote", () => {
    expect(injectRules("我的指令", [])).toBe("我的指令");
  });

  it("单条规则 → 注入规则块并含规则名", () => {
    const r = mkRule({ id: "a", name: "护主角", content: "必须保护主角", category: "writing" });
    const out = injectRules("", [r]);
    expect(out).toContain("创作规则");
    expect(out).toContain("护主角");
    expect(out).not.toContain("已被更高优先级规则覆盖");
  });

  it("存在冲突 → 败方规则标记「已被覆盖」", () => {
    const a = mkRule({ id: "a", name: "不伤主角", content: "禁止伤害主角", category: "writing", priority: 10 });
    const b = mkRule({ id: "b", name: "护主角", content: "必须保护主角", category: "writing", priority: 5 });
    const out = injectRules("", [a, b]);
    expect(out).toContain("护主角");
    expect(out).toContain("[已被更高优先级规则覆盖]");
  });

  it("authorNote 非空 → 拼接「作者指令」段", () => {
    const r = mkRule({ id: "a", name: "护主角", content: "必须保护主角", category: "writing" });
    const out = injectRules("请写悲情结局", [r]);
    expect(out).toContain("作者指令");
    expect(out).toContain("请写悲情结局");
  });

  it("有冲突 → 附冲突裁决记录", () => {
    const a = mkRule({ id: "a", name: "不伤主角", content: "禁止伤害主角", category: "writing", priority: 10 });
    const b = mkRule({ id: "b", name: "护主角", content: "必须保护主角", category: "writing", priority: 5 });
    const out = injectRules("", [a, b]);
    expect(out).toContain("冲突裁决记录");
  });
});
