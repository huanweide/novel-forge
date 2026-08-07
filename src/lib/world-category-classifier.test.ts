import { describe, it, expect } from "vitest";
import { classifyWorldCategory, ALL_WORLD_CATEGORIES, WORLD_CATEGORY_LABELS, type WorldCategory } from "./world-category-classifier";

describe("世界卡确定性分类器", () => {
  it("15 个世界卡分类均能唯一识别（覆盖用户 14 类含 3 新类 + item/magic_system/technique）", () => {
    const cases: Array<[string, WorldCategory]> = [
      ["东荒大陆横贯万里，中央有座巨城名为天都，城外秘境环绕", "geography"],
      ["太玄门乃正道第一宗门，其下还有七大附属家族与王朝结盟", "faction"],
      ["他祭出本命法宝焚天鼎，又吞下三枚疗伤丹药", "item"],
      ["修士吐纳灵气锤炼真元，境界分九重，渡劫可飞升", "magic_system"],
      ["凌霜使出一式御剑术，剑诀凌厉，身法飘忽难测", "technique"],
      ["深海之底栖息着太古妖兽与神兽麒麟，异族林立", "creature"],
      ["民间盛行祭祀图腾的古老习俗，婚嫁须行拜师礼", "culture"],
      ["上古纪元曾爆发灭世之战，遗迹中刻满先皇传说", "history"],
      ["天道无情，门中弟子触犯戒律必遭天规反噬", "law"],
      ["一枚下品灵石可换百枚铜钱，上品灵石价值连城", "currency"],
      ["陈凡与凌霜本是师徒，后成宿敌，却暗藏知己之情", "character_relationship"],
      ["少年觉醒系统面板，金手指让他看见属性漏洞", "custom"],
      ["预言早已写下他的命格，因果线在此闭环，气运加身", "fate_system"],
      ["此界时空可折叠，引力异常，能量守恒被维度打破", "physics"],
      ["城邦制下阶级森严，科举取士，官府按律法征税", "public_system"],
    ];
    for (const [text, expected] of cases) {
      const r = classifyWorldCategory(text);
      expect(r.bucket, `段落应归 ${expected}：\n${text}\n实际命中=${r.matched.join(",")}`).toBe(expected);
      expect(r.category).toBe(expected);
    }
  });

  it("2 个元桶：纯角色对话归 character，空/无关文本归 unknown", () => {
    expect(classifyWorldCategory("陈凡说道：「此事不可外传。」凌霜笑道：「我明白。」").bucket).toBe("character");
    expect(classifyWorldCategory("    ").bucket).toBe("unknown");
    expect(classifyWorldCategory("今天天气真好，窗外鸟鸣清脆").bucket).toBe("unknown");
  });

  it("边界消歧：灵石（货币）vs 灵石矿（物品）不冲突", () => {
    expect(classifyWorldCategory("他掏出一把灵石付账").bucket).toBe("currency");
    expect(classifyWorldCategory("灵石矿脉丰富，可炼制法宝").bucket).toBe("item");
  });

  it("边界消歧：命劫（命运）vs 渡劫（力量体系）", () => {
    expect(classifyWorldCategory("命劫将至，预言中的劫数无人可避").bucket).toBe("fate_system");
    expect(classifyWorldCategory("修士渡劫失败，被雷劫劈散肉身").bucket).toBe("magic_system");
  });

  it("边界消歧：系统（金手指）vs 制度（公开体系）", () => {
    expect(classifyWorldCategory("他绑定了系统，获得金手指外挂").bucket).toBe("custom");
    expect(classifyWorldCategory("国家实行科举制，户籍与爵位挂钩").bucket).toBe("public_system");
  });

  it("全 15 类在 ALL_WORLD_CATEGORIES 中且均能映射", () => {
    expect(ALL_WORLD_CATEGORIES).toHaveLength(15);
    expect(new Set(ALL_WORLD_CATEGORIES).size).toBe(15);
  });

  it("WORLD_CATEGORY_LABELS 与 ALL_WORLD_CATEGORIES 同源（键集一致且标签非空，杜绝 catLabel 手抄漂移）", () => {
    // catLabel（生成侧 globalPrompt 分组标题）现已派生自 WORLD_CATEGORY_LABELS。
    // 此用例为 Round-4 加固：确保标签映射与分类清单永远 1:1 对齐，
    // 一旦有人增删/改名 ALL_WORLD_CATEGORIES 却漏改标签，本用例会失败（叠加 tsc 编译期报错）。
    const cats = ALL_WORLD_CATEGORIES;
    const labelKeys = Object.keys(WORLD_CATEGORY_LABELS) as WorldCategory[];
    expect(new Set(labelKeys).size).toBe(cats.length);
    for (const cat of cats) {
      expect(WORLD_CATEGORY_LABELS[cat], `分类 ${cat} 必须存在中文标签`).toBeTruthy();
      expect(WORLD_CATEGORY_LABELS[cat].trim().length).toBeGreaterThan(0);
    }
    // 反向：标签映射不允许出现分类清单之外的多余 key
    for (const k of labelKeys) {
      expect(cats).toContain(k);
    }
  });
});
