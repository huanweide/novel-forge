import { describe, it, expect } from "vitest";
import { buildLoreSection, renderLoreEntries } from "@/core/assembly/engine";
import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_SECTIONS, type WorldCategory } from "@/lib/world-category-classifier";

// 构造最小化的触发世界书词条（buildLoreSection 仅读取 category/title/content/depth）。
function mkLore(category: string) {
  return {
    entry: { category, title: `标题-${category}`, content: `内容-${category}`, depth: 3 } as any,
    triggerKeyword: "k",
    matchScore: 1,
  };
}

// 关键词触发路径（buildLoreSection）。
describe("装配引擎 loreSection 板块标签（Round-5 / NEW-UI-WC-1 回归）", () => {
  it("全 15 类均能通过 WORLD_CATEGORY_SECTIONS 拿到自身分组标题，不再塌缩到 custom", () => {
    const lore = ALL_WORLD_CATEGORIES.map((c) => mkLore(c));
    const out = buildLoreSection(lore, 100000);
    for (const cat of ALL_WORLD_CATEGORIES) {
      const { emoji, label } = WORLD_CATEGORY_SECTIONS[cat];
      expect(out, `分类 ${cat} 必须以自身标题分组，而非塌缩到 custom`).toContain(`【${emoji} ${label}】`);
    }
    // 15 类各出一节，custom 仅代表其自身分类，不应吞掉其他 14 类。
    expect(out.match(/【/g)?.length).toBe(ALL_WORLD_CATEGORIES.length);
  });

  it("原漏网的 4 类（fate_system/physics/public_system/character_relationship）不再被塞进「📦 自定义」", () => {
    const missing = ["fate_system", "physics", "public_system", "character_relationship"];
    const out = buildLoreSection(missing.map((c) => mkLore(c)), 100000);
    for (const cat of missing) {
      const { emoji, label } = WORLD_CATEGORY_SECTIONS[cat as WorldCategory];
      expect(out, `分类 ${cat} 必须出现自身标题`).toContain(`【${emoji} ${label}】`);
    }
    // 仅这 4 类输入时，输出里不应出现 custom 兜底标题。
    expect(out, "漏网 4 类不应触发 custom 兜底").not.toContain("【📦 自定义】");
  });

  it("未知/非法分类仍安全回退到 custom 兜底", () => {
    const out = buildLoreSection([mkLore("nonexistent_cat")], 100000);
    expect(out).toContain("【📦 自定义】");
  });
});

// 强制常驻注入路径（renderLoreEntries）。
describe("装配引擎 renderLoreEntries 板块标签（Round-5 / NEW-UI-WC-1 回归）", () => {
  it("原漏网的 4 类在 forcedLore 路径同样不再塌缩到 custom", () => {
    const entries = ["fate_system", "physics", "public_system", "character_relationship"].map((c) => ({
      title: `标题-${c}`,
      content: `内容-${c}`,
      category: c,
    }));
    const out = renderLoreEntries(entries);
    for (const cat of ["fate_system", "physics", "public_system", "character_relationship"]) {
      const { emoji, label } = WORLD_CATEGORY_SECTIONS[cat as WorldCategory];
      expect(out, `forced 路径分类 ${cat} 必须出现自身标题`).toContain(`【${emoji} ${label}】`);
    }
    expect(out, "forced 路径漏网 4 类不应触发 custom 兜底").not.toContain("【📦 自定义】");
  });
});
