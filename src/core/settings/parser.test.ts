/**
 * parser.ts 纯函数测试——锁死「智能填表」三卡解析的 JSON 清洗与归一化契约。
 *
 * 覆盖：parseSettings / parseLorebookOnly / parseStyleOnly 三条解析入口
 * （均以 mock LLM client 注入 JSON 字符串，无需真实模型）；
 * 以及 normalizeCharacter / normalizeLoreEntry / normalizeStyleProfile
 * 的兜底默认值、数值强制、类型守卫；to*CreateParams 转换映射。
 *
 * 纯测试补全，零生产代码改动。真实回归会让用户导入的角色/世界/风格卡静默损坏，
 * 本文件把所有「肉眼难查」的归一化边界钉死。
 */
import { describe, it, expect } from "vitest";
import type { LLMClient } from "@/core/llm/client";
import {
  parseSettings,
  parseLorebookOnly,
  parseStyleOnly,
  toCharacterCreateParams,
  toLorebookCreateParams,
  toStyleCardCreateParams,
} from "./parser";

/** 构造一个只返回固定 content 的假 LLM client，绕开真实模型调用 */
function mockClient(content: string): LLMClient {
  return {
    chat: async () => ({
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
  } as unknown as LLMClient;
}

describe("parseSettings —— 三卡解析入口", () => {
  it("剥离 ```json 围栏后正确解析三卡", async () => {
    const json = JSON.stringify({
      characters: [
        {
          name: "樊斯瑞",
          aliases: ["瑞宝宝"],
          age: "20",
          gender: "男",
          role: "protagonist",
          appearance: { hair: "黑短发", eyes: "黑瞳", height: "178", build: "匀称", features: "", attire: "卫衣" },
          personality: { dominant: "冷静", drive: "搞钱" },
          dialogueDescription: "直接",
          dialogueExamples: ["继续"],
          background: "天津大学生",
          hiddenMotives: ["征服世界"],
          relations: [{ target: "千惠", relation: "网友" }],
        },
      ],
      loreEntries: [
        { title: "龙陨之地", category: "geography", keys: ["龙陨", "禁地"], content: "一片焦土", insertionOrder: 90 },
      ],
      synopsis: "主角崛起",
      toneKeywords: ["热血", "沉重"],
      styleProfile: {
        povType: "third_person_limited",
        narrativeDistance: "close",
        avgSentenceLength: 22,
        shortSentenceRatio: 0.35,
        longSentenceRatio: 0.1,
        dialogueRatio: 0.4,
        descriptionRatio: 0.2,
        actionRatio: 0.25,
        innerThoughtRatio: 0.15,
        tonalMarkers: { 冷峻: 0.7 },
        lexicalFeatures: { 古风雅语: 0.6 },
        styleDescription: "文风概括",
        sampleText: "代表段落",
      },
    });
    const parsed = await parseSettings(`\`\`\`json\n${json}\n\`\`\``, mockClient(`\`\`\`json\n${json}\n\`\`\``));

    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0].name).toBe("樊斯瑞");
    expect(parsed.characters[0].role).toBe("protagonist");
    expect(parsed.characters[0].appearance.hair).toBe("黑短发");
    expect(parsed.loreEntries[0].title).toBe("龙陨之地");
    expect(parsed.loreEntries[0].category).toBe("geography");
    expect(parsed.loreEntries[0].insertionOrder).toBe(90);
    expect(parsed.synopsis).toBe("主角崛起");
    expect(parsed.toneKeywords).toEqual(["热血", "沉重"]);
    expect(parsed.styleProfile).not.toBeNull();
    expect(parsed.styleProfile!.avgSentenceLength).toBe(22);
    expect(parsed.styleProfile!.tonalMarkers).toEqual({ 冷峻: 0.7 });
  });

  it("无围栏的纯 JSON 也能解析", async () => {
    const json = JSON.stringify({ characters: [], loreEntries: [], synopsis: "x", toneKeywords: [], styleProfile: null });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.characters).toEqual([]);
    expect(parsed.loreEntries).toEqual([]);
    expect(parsed.styleProfile).toBeNull();
  });

  it("角色缺字段时按契约兜底（不抛错、不丢其他卡）", async () => {
    const json = JSON.stringify({
      characters: [{ name: "无名氏" }],
      loreEntries: [{ title: "词条A" }],
      synopsis: "",
      toneKeywords: [],
    });
    const parsed = await parseSettings(json, mockClient(json));
    const c = parsed.characters[0];
    expect(c.name).toBe("无名氏");
    expect(c.age).toBe("未知");
    expect(c.gender).toBe("未知");
    expect(c.role).toBe("supporting"); // 缺省归为配角
    expect(c.appearance).toEqual({ hair: "", eyes: "", height: "", build: "", features: "", attire: "" });
    expect(c.personality).toEqual([]);
    expect(c.relations).toEqual([]);
    // 其他卡不受影响
    expect(parsed.loreEntries[0].title).toBe("词条A");
    expect(parsed.loreEntries[0].category).toBe("custom"); // 缺省 custom
    expect(parsed.loreEntries[0].insertionOrder).toBe(50); // 缺省 50
  });

  it("角色名为空时回退「未命名角色」", async () => {
    const json = JSON.stringify({ characters: [{}], loreEntries: [], toneKeywords: [] });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.characters[0].name).toBe("未命名角色");
  });

  it("非法 JSON（含前缀散文无围栏）应抛错", async () => {
    const junk = "好的，这是结果：\n{\"characters\": []}\n希望能帮到你";
    await expect(parseSettings(junk, mockClient(junk))).rejects.toThrow(/解析 AI 返回的 JSON 失败/);
  });

  it("characters 为非数组时应抛错", async () => {
    const bad = JSON.stringify({ characters: "不是数组", loreEntries: [], toneKeywords: [] });
    await expect(parseSettings(bad, mockClient(bad))).rejects.toThrow(/解析 AI 返回的 JSON 失败/);
  });
});

describe("normalizeStyleProfile —— 数值强制与类型守卫", () => {
  it("字符串数字回落默认值而非 NaN", async () => {
    const json = JSON.stringify({
      characters: [],
      loreEntries: [],
      toneKeywords: [],
      styleProfile: { avgSentenceLength: "25", shortSentenceRatio: "0.3" },
    });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.styleProfile!.avgSentenceLength).toBe(25); // 默认值
    expect(parsed.styleProfile!.shortSentenceRatio).toBe(0.3); // 默认值
  });

  it("有效数字被原样保留", async () => {
    const json = JSON.stringify({
      characters: [],
      loreEntries: [],
      toneKeywords: [],
      styleProfile: { avgSentenceLength: 30, dialogueRatio: 0.5 },
    });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.styleProfile!.avgSentenceLength).toBe(30);
    expect(parsed.styleProfile!.dialogueRatio).toBe(0.5);
  });

  it("NaN 数值回落默认", async () => {
    const json = JSON.stringify({
      characters: [],
      loreEntries: [],
      toneKeywords: [],
      styleProfile: { avgSentenceLength: NaN },
    });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.styleProfile!.avgSentenceLength).toBe(25);
  });

  it("tonalMarkers 为非对象时回落空对象", async () => {
    const json = JSON.stringify({
      characters: [],
      loreEntries: [],
      toneKeywords: [],
      styleProfile: { tonalMarkers: ["冷峻"] },
    });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.styleProfile!.tonalMarkers).toEqual({});
  });

  it("空对象 styleProfile 视为存在并按默认归一化（非 null）", async () => {
    const json = JSON.stringify({ characters: [], loreEntries: [], toneKeywords: [], styleProfile: {} });
    const parsed = await parseSettings(json, mockClient(json));
    expect(parsed.styleProfile).not.toBeNull();
    expect(parsed.styleProfile!.povType).toBe("third_person_limited");
    expect(parsed.styleProfile!.narrativeDistance).toBe("medium");
  });
});

describe("parseLorebookOnly —— 仅世界卡", () => {
  const entry = { title: "功法", category: "magic_system", keys: ["灵气"], content: "修炼体系", insertionOrder: 80 };

  it("JSON 数组（带围栏）正常解析", async () => {
    const json = JSON.stringify([entry]);
    const arr = await parseLorebookOnly(`\`\`\`json\n${json}\n\`\`\``, mockClient(`\`\`\`json\n${json}\n\`\`\``));
    expect(arr).toHaveLength(1);
    expect(arr[0].category).toBe("magic_system");
  });

  it("能从散文包裹中提取首个数组（无围栏也能容错）", async () => {
    const raw = `以下是提取结果：\n[${JSON.stringify(entry)}]\n以上为全部词条`;
    const arr = await parseLorebookOnly(raw, mockClient(raw));
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe("功法");
  });

  it("缺字段的词条按契约兜底", async () => {
    const raw = JSON.stringify([{ title: "无名设定" }]);
    const arr = await parseLorebookOnly(raw, mockClient(raw));
    expect(arr[0].category).toBe("custom");
    expect(arr[0].insertionOrder).toBe(50);
    expect(arr[0].keys).toEqual([]);
  });

  it("非法数组 JSON 应抛错", async () => {
    const bad = "不是数组";
    await expect(parseLorebookOnly(bad, mockClient(bad))).rejects.toThrow(/解析世界卡JSON失败/);
  });
});

describe("parseStyleOnly —— 仅风格卡", () => {
  const styleJson = {
    povType: "first_person",
    narrativeDistance: "close",
    avgSentenceLength: 18,
    shortSentenceRatio: 0.4,
    longSentenceRatio: 0.05,
    dialogueRatio: 0.3,
    descriptionRatio: 0.3,
    actionRatio: 0.3,
    innerThoughtRatio: 0.1,
    tonalMarkers: { 幽默: 0.6 },
    lexicalFeatures: { 口语: 0.8 },
    styleDescription: "轻松口语风",
    writingRules: ["不准用突然开头", 123, null, "对话不超过三行"],
    sampleText: "示例段落",
  };

  it("返回风格画像并过滤非字符串写作规则", async () => {
    const json = JSON.stringify(styleJson);
    const result = await parseStyleOnly(json, mockClient(json));
    expect(result.povType).toBe("first_person");
    expect(result.avgSentenceLength).toBe(18);
    // writingRules 仅保留字符串，过滤掉数字与 null
    expect(result.writingRules).toEqual(["不准用突然开头", "对话不超过三行"]);
  });

  it("能从散文包裹中提取首个对象", async () => {
    const raw = `分析完毕：\n${JSON.stringify(styleJson)}\n结束`;
    const result = await parseStyleOnly(raw, mockClient(raw));
    expect(result.povType).toBe("first_person");
  });

  it("非法风格 JSON 应抛错", async () => {
    const bad = "{这不是合法json";
    await expect(parseStyleOnly(bad, mockClient(bad))).rejects.toThrow(/解析风格卡JSON失败/);
  });
});

describe("to*CreateParams —— DB 创建参数映射", () => {
  const char = {
    name: "樊斯瑞",
    aliases: ["瑞"],
    age: "20",
    gender: "男",
    role: "protagonist" as const,
    appearance: { hair: "黑", eyes: "黑", height: "178", build: "匀称", features: "", attire: "卫衣" },
    personality: ["冷静"],
    dialogueDescription: "直接",
    dialogueExamples: ["继续"],
    background: "天津",
    hiddenMotives: ["征服"],
    relations: [{ target: "千惠", relation: "网友" }],
  };
  const entry = { title: "龙陨", category: "geography" as const, keys: ["龙陨"], content: "焦土", insertionOrder: 90 };
  const profile = {
    povType: "third_person_limited",
    narrativeDistance: "medium",
    avgSentenceLength: 25,
    shortSentenceRatio: 0.3,
    longSentenceRatio: 0.15,
    dialogueRatio: 0.35,
    descriptionRatio: 0.25,
    actionRatio: 0.25,
    innerThoughtRatio: 0.15,
    tonalMarkers: { 冷峻: 0.7 },
    lexicalFeatures: { 古风雅语: 0.6 },
    styleDescription: "文风",
    sampleText: "样本",
  };

  it("toCharacterCreateParams：关系 target→targetName、带导入标签、默认存活", () => {
    const p = toCharacterCreateParams(char, "pid");
    expect(p.projectId).toBe("pid");
    expect(p.name).toBe("樊斯瑞");
    expect(p.relationships[0]).toEqual({ targetName: "千惠", relation: "网友", dynamic: "", notes: "" });
    expect(p.tags).toContain("📥导入");
    expect(p.currentStatus).toBe("alive");
    // dialogueStyle 由 dialogueDescription/dialogueExamples 组合
    expect(p.dialogueStyle.description).toBe("直接");
    expect(p.dialogueStyle.examples).toEqual(["继续"]);
  });

  it("toLorebookCreateParams：字段映射且默认启用", () => {
    const p = toLorebookCreateParams(entry, "pid");
    expect(p.projectId).toBe("pid");
    expect(p.title).toBe("龙陨");
    expect(p.category).toBe("geography");
    expect(p.enabled).toBe(true);
    expect(p.relatedEntryIds).toEqual([]);
  });

  it("toStyleCardCreateParams：sampleText 为空回落 null", () => {
    const p = toStyleCardCreateParams({ ...profile, sampleText: "" }, "pid", 5);
    expect(p.projectId).toBe("pid");
    expect(p.sourceChapterCount).toBe(5);
    expect(p.sampleText).toBeNull();
    expect(p.tonalMarkers).toEqual({ 冷峻: 0.7 });
  });
});
