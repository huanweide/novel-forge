import { describe, it, expect, beforeAll } from "vitest";

// 动态 import：character-dedupe 顶层会构造 PrismaClient（需 DATABASE_URL），
// 在 import 之前补一个占位连接串，避免 vitest 环境未加载 .env 时构造失败。
// computeConfidence / toCharLite 为纯函数，不会真正连库。
let computeConfidence: (members: any[], allNames: string[]) => "high" | "low";
let toCharLite: (row: any) => any;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/novelforge";
  const mod = await import("./character-dedupe");
  computeConfidence = mod.computeConfidence;
  toCharLite = mod.toCharLite;
});

// 最小 CharLite 构造器（computeConfidence 只用到 id/name；其余字段仅占位）
const c = (id: string, name: string) => ({
  id,
  name,
  aliases: [] as string[],
  background: "",
  storyLine: "",
  relationships: [] as any[],
  tags: [] as string[],
});

describe("computeConfidence（v2.0.5 置信度分级 + 单字缩写修复）", () => {
  it("标准尊称变体无歧义并入唯一同姓正主 → high（直接合并）", () => {
    const members = [c("1", "韩立"), c("2", "韩先生")];
    expect(computeConfidence(members, ["韩立", "韩先生"])).toBe("high");
  });

  it("单字缩写（昵称缩写）并入唯一同姓正主 → high（修复点：此前误判 low）", () => {
    // 旧实现 resolveHonorificTarget 对非 isHonorificVariant 的单字返回 null，
    // 导致「樊」这类明确缩写落到 low/pending；修复后按 coreSurname 找唯一正主 → high。
    const members = [c("1", "樊斯瑞"), c("2", "樊")];
    expect(computeConfidence(members, ["樊斯瑞", "樊"])).toBe("high");
  });

  it("纯语义相似的普通姓名（无变体证据） → low（等用户确认）", () => {
    const members = [c("1", "林惊羽"), c("2", "林惊雨")];
    expect(computeConfidence(members, ["林惊羽", "林惊雨"])).toBe("low");
  });

  it("同姓多正主导致尊称歧义 → low（韩立/韩先生 核心名「韩立」≠「韩」，不触发 v2.17 同核 high，仍走歧义闸门防错并）", () => {
    const members = [c("1", "韩立"), c("2", "韩先生")];
    expect(computeConfidence(members, ["韩立", "韩先生", "韩雪"])).toBe("low");
  });

  it("单字缩写但同姓多正主 → low（樊斯瑞/樊 核心名「樊斯瑞」≠「樊」，歧义闸门防错并）", () => {
    const members = [c("1", "樊斯瑞"), c("2", "樊")];
    expect(computeConfidence(members, ["樊斯瑞", "樊", "樊无解"])).toBe("low");
  });

  it("单成员（无被并者） → high", () => {
    expect(computeConfidence([c("1", "独行侠")], ["独行侠"])).toBe("high");
  });

  // ── 任务 #16 点名场景：复杂称呼同一人识别（迪哥先生 / 迪哥 / 迪哥·若昂内）──
  it("任务#16 复杂称呼同一人：迪哥先生/迪哥/迪哥·若昂内 同核「迪哥」→ high（自动合并）", () => {
    const members = [c("1", "迪哥"), c("2", "迪哥先生"), c("3", "迪哥·若昂内")];
    expect(computeConfidence(members, ["迪哥", "迪哥先生", "迪哥·若昂内"])).toBe("high");
  });

  it("任务#16 复杂称呼防错并：迪哥·若昂内/迪哥·桑切斯 两马甲同核但可能指向不同人 → low（交用户确认）", () => {
    const members = [c("1", "迪哥·若昂内"), c("2", "迪哥·桑切斯")];
    expect(computeConfidence(members, ["迪哥·若昂内", "迪哥·桑切斯"])).toBe("low");
  });

  it("任务#16 复杂称呼前缀缩写：迪哥/小迪（小+单字姓缩写）→ high", () => {
    const members = [c("1", "迪哥"), c("2", "小迪")];
    expect(computeConfidence(members, ["迪哥", "小迪"])).toBe("high");
  });
});

describe("toCharLite（DB 行 → CharLite 归一化）", () => {
  it("DB 行的 null 字段回落为默认值", () => {
    const row = {
      id: "x",
      name: "测试",
      aliases: null,
      background: null,
      storyLine: null,
      relationships: null,
      tags: null,
    };
    const lite = toCharLite(row);
    expect(lite.aliases).toEqual([]);
    expect(lite.background).toBe("");
    expect(lite.storyLine).toBe("");
    expect(lite.relationships).toBeNull();
    expect(lite.tags).toEqual([]);
  });

  it("数组 / 对象字段原样保留", () => {
    const row = {
      id: "x",
      name: "测试",
      aliases: ["a", "b"],
      background: "bg",
      storyLine: "sl",
      relationships: { targetName: "y", relation: "友" },
      tags: ["t1"],
    };
    const lite = toCharLite(row);
    expect(lite.aliases).toEqual(["a", "b"]);
    expect(lite.relationships).toEqual({ targetName: "y", relation: "友" });
    expect(lite.tags).toEqual(["t1"]);
  });
});
