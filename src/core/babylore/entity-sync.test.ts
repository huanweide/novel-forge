import { describe, it, expect, vi, beforeEach } from "vitest";

// R2-002 / R2-001 主张级集成测试：
// 验证自动填表链路「15 类世界卡分类」全部可达，且 5 个此前不可达的分类
// （magic_system / culture / history / law / currency）经 TYPE_TO_CATEGORY 直接落库；
// 同时验证 R2-001 的确定性兜底——当 LLM 给的 type 落在 custom（不可信）时，
// 世界卡分类器能把灵石/天道戒律/灭世之战等正确路由到对应分类，而非静默归 custom。

const createdLore: Array<{ title: string; category: string }> = [];
const createdChars: string[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    characterCard: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: any) => {
        createdChars.push(args.data.name);
        return { id: "c-" + args.data.name, ...args.data };
      }),
    },
    lorebookEntry: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: any) => {
        createdLore.push({ title: args.data.title, category: args.data.category });
        return { id: "l-" + args.data.title, ...args.data };
      }),
    },
  },
}));

function mockLlm(entities: Array<Record<string, unknown>>) {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ entities }) } }],
    }),
  }));
}

import { prisma } from "@/lib/prisma";
import { syncChapterEntities } from "@/core/babylore/entity-sync";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";

// 13 个应经自动填表落库的世界卡分类（排除角色卡专属的 character_relationship 与兜底桶 custom）
const EXPECTED_LORE = ALL_WORLD_CATEGORIES.filter(
  (c) => c !== "character_relationship" && c !== "custom",
);

beforeEach(() => {
  createdLore.length = 0;
  createdChars.length = 0;
});

describe("R2-002 15 类世界卡分类全部可达（TYPE_TO_CATEGORY 直接落库）", () => {
  it("mock LLM 返回覆盖各分类的 type → 落库 category 集合 == 13 个世界卡分类", async () => {
    // type 枚举值 → 期望落库 category
    const rows: Array<[string, string, string]> = [
      // [name, type, 正文描述]
      ["东荒大陆", "location", "横贯万里的东荒大陆中央有座巨城"],
      ["太玄门", "organization", "正道第一宗门太玄门"],
      ["焚天鼎", "item", "本命法宝焚天鼎"],
      ["灵气修炼体系", "magic_system", "修士吐纳灵气锤炼真元"],
      ["御剑术", "technique", "凌霜使出一式御剑术"],
      ["太古妖兽", "creature", "深海之底栖息太古妖兽"],
      ["祭祀习俗", "culture", "民间盛行祭祀图腾的古老习俗"],
      ["灭世之战", "history", "上古纪元曾爆发灭世之战"],
      ["天道戒律", "law", "天道无情，触犯戒律必遭反噬"],
      ["下品灵石", "currency", "一枚下品灵石可换百枚铜钱"],
      ["命格预言", "fate", "预言早已写下他的命格"],
      ["时空折叠", "physics", "此界时空可折叠，引力异常"],
      ["城邦科举", "public", "城邦制下科举取士，官府征税"],
    ];
    const entities: Array<Record<string, unknown>> = rows.map(([name, type, description]) => ({
      name,
      type,
      summary: description,
      description,
    }));
    // 另加一个角色卡，验证角色路径不被误并/误归
    entities.push({ name: "陈凡", type: "character", summary: "主角", description: "少年陈凡", role: "主角" });

    mockLlm(entities);
    const r = await syncChapterEntities("proj-r2-002", "正文占位", {
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "k",
      model: "m",
    });
    expect(r.error).toBeUndefined();

    const cats = new Set(createdLore.map((l) => l.category));
    // 主张级断言：13 类一个不少
    for (const c of EXPECTED_LORE) {
      expect(cats.has(c), `分类 ${c} 应被自动填表落库，实际落库=${[...cats].join(",")}`).toBe(true);
    }
    // 且不应出现 custom / character_relationship 之外的脏分类
    expect(cats.size).toBe(EXPECTED_LORE.length);
    // 角色卡单独入库
    expect(createdChars).toContain("陈凡");
  });
});

describe("R2-001 确定性兜底：type=custom 时分类器重新路由", () => {
  it("type=other + 灵石正文 → 兜底归 currency（而非静默 custom）", async () => {
    mockLlm([
      { name: "灵石", type: "other", summary: "货币", description: "他掏出一把灵石付账，上品灵石价值连城" },
    ]);
    await syncChapterEntities("proj-r2-001-a", "正文占位", {
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "k",
      model: "m",
    });
    expect(createdLore).toHaveLength(1);
    expect(createdLore[0].category).toBe("currency");
  });

  it("type=other + 灭世之战正文 → 兜底归 history", async () => {
    mockLlm([
      { name: "灭世之战", type: "other", summary: "上古战役", description: "上古纪元曾爆发灭世之战，遗迹中刻满传说" },
    ]);
    await syncChapterEntities("proj-r2-001-b", "正文占位", {
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "k",
      model: "m",
    });
    expect(createdLore[0].category).toBe("history");
  });

  it("type=other + 纯角色对话（无世界关键词）→ 保持 custom（角色关系不误归世界卡）", async () => {
    mockLlm([
      { name: "陈凡", type: "other", summary: "x", description: "陈凡说道：「此事不可外传。」凌霜笑道：「我明白。」" },
    ]);
    await syncChapterEntities("proj-r2-001-c", "正文占位", {
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "k",
      model: "m",
    });
    expect(createdLore[0].category).toBe("custom");
  });
});
