import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { parseTemplateToDraft } from "./from-template";
import { validatePresetContent } from "./validate";

const TEMPLATE_DIR = path.join(process.cwd(), "templates");

describe("parseTemplateToDraft —— 本地模板 → 创意工坊预设草稿", () => {
  it("风格卡模板 → style 预设，解析出文风关键词、视角与禁用写法", () => {
    const md = [
      "# 风格卡模板 · 《作品名》",
      "",
      "> 用途：填好本卡后导入",
      "",
      "## 文风关键词（3–5 个）",
      "例：冷峻克制 / 电影镜头感 / 对话驱动",
      "",
      "## 叙事视角",
      "- 视角（第一人称 / 第三有限 / 全知）：第三有限",
      "- POV 角色：",
      "",
      "## 禁用写法（避坑清单）",
      "- 避免：滥用形容词堆砌",
      "- 避免：空洞比喻连发",
      "",
    ].join("\n");

    const draft = parseTemplateToDraft("风格卡模板.md", md);
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe("style");
    expect(String(draft!.content.styleDescription)).toContain("冷峻克制");
    expect(draft!.content.povType).toBe("third_person_limited");
    expect(draft!.content.avoidPatterns).toContain("滥用形容词堆砌");
    expect(validatePresetContent("style", draft!.content).ok).toBe(true);
  });

  it("视角填「第一人称」时映射为 first_person", () => {
    const md = "# 风格卡模板\n## 文风关键词\n例：细腻\n## 叙事视角\n- 视角（第一人称 / 第三有限 / 全知）：第一人称\n";
    const draft = parseTemplateToDraft("风格卡模板.md", md);
    expect(draft!.content.povType).toBe("first_person");
  });

  it("角色卡预设 → character 预设；姓名留空时给出可注入的占位名", () => {
    const md = [
      "# 角色卡预设 · 《角色名》",
      "",
      "## 基础",
      "- 姓名：",
      "- 性别 / 年龄：女 / 20",
      "",
      "## 性格（三层）",
      "- 表层（别人看到的）：冷淡",
      "- 里层（熟人看到的）：温柔",
      "- 核层（独处时的真实自我）：孤独",
      "",
    ].join("\n");

    const draft = parseTemplateToDraft("角色卡预设.md", md);
    expect(draft!.type).toBe("character");
    expect(String(draft!.content.name).length).toBeGreaterThan(0); // 非空，否则无法入库
    const personality = draft!.content.personality as Record<string, string>;
    expect(personality.表层).toBe("冷淡");
    expect(personality.核层).toBe("孤独");
    expect(validatePresetContent("character", draft!.content).ok).toBe(true);
  });

  it("角色卡填了姓名则使用真名，不用占位名", () => {
    const md = "# 角色卡预设\n## 基础\n- 姓名：林霜\n- 性别 / 年龄：女 / 22\n";
    const draft = parseTemplateToDraft("角色卡预设.md", md);
    expect(draft!.content.name).toBe("林霜");
    expect(draft!.title).toBe("林霜");
  });

  it("大纲模板 → story_progression 预设，各小节成为词条", () => {
    const md = [
      "# 大纲模板 · 《作品名》",
      "",
      "## 一句话核心",
      "（用一句话说清这本小说讲什么）",
      "",
      "## 三幕结构",
      "- 第一幕（起 · 钩子）：",
      "",
    ].join("\n");

    const draft = parseTemplateToDraft("大纲模板.md", md);
    expect(draft!.type).toBe("story_progression");
    const entries = draft!.content.entries as { title: string; content: string }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].title).toBe("一句话核心");
    expect(validatePresetContent("story_progression", draft!.content).ok).toBe(true);
  });

  it("模板被改到没有小节时兜底产出非空 entries，仍可入库", () => {
    const draft = parseTemplateToDraft("大纲模板.md", "# 大纲\n只有正文没有小节");
    expect(draft).not.toBeNull();
    expect((draft!.content.entries as unknown[]).length).toBeGreaterThan(0);
    expect(validatePresetContent("story_progression", draft!.content).ok).toBe(true);
  });

  it("无法识别的模板返回 null（由调用方跳过）", () => {
    expect(parseTemplateToDraft("随便一个文件.md", "# 测试\n内容")).toBeNull();
  });
});

describe("真实 templates/*.md 端到端解析", () => {
  const files = ["大纲模板.md", "风格卡模板.md", "角色卡预设.md"];

  for (const f of files) {
    it(`${f} 能被解析且通过结构校验（即：可加入市集）`, () => {
      const p = path.join(TEMPLATE_DIR, f);
      if (!existsSync(p)) {
        // 模板属社区资产，缺失时跳过而不是判定失败
        expect(true).toBe(true);
        return;
      }
      const md = readFileSync(p, "utf8");
      const draft = parseTemplateToDraft(f, md);
      expect(draft).not.toBeNull();
      const v = validatePresetContent(draft!.type, draft!.content);
      expect(v.ok, `${f} 校验失败：${v.errors.join("；")}`).toBe(true);
    });
  }
});
