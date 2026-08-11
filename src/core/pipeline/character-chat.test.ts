import { describe, it, expect } from "vitest";
import {
  buildCharacterSystemPrompt,
  CHARACTER_CHAT_MODES,
  type BuildCharacterPromptInput,
} from "./character-chat";

const base: BuildCharacterPromptInput = {
  name: "李墨",
  aliases: ["墨哥"],
  role: "protagonist",
  currentStatus: "alive",
  age: 18,
  gender: "男",
  appearance: { hair: "黑长直", eyes: "丹凤眼", height: "178cm", build: "修长", distinguishing: "左脸刀疤", attire: "黑衣" },
  personality: { dominant: "外冷内热", drive: "复仇", contradiction: "渴望认可却自尊极强", socialMask: "对人冷漠", habits: ["咬指甲"] },
  background: "铁匠铺出身，宗门大比夺冠。",
  abilities: ["步频幻觉", "逆足终结"],
  hiddenMotives: ["寻找灭门仇人"],
  relationships: [{ targetName: "王五", relation: "宿敌", dynamic: "亦敌亦友" }],
  timeline: [{ age: 16, event: "觉醒血脉", reference: "第一卷" }],
  dialogueStyle: { description: "冷漠寡言", examples: ["哼，就这？"], vocabulary: ["古风"], speechPatterns: ["多用反问"] },
  tags: ["复仇", "天才"],
  storyLine: "从铁匠到巅峰。",
  projectName: "星辰",
  projectGenre: ["玄幻"],
  projectSynopsis: "少年复仇记。",
  mode: "dialogue",
};

describe("buildCharacterSystemPrompt", () => {
  it("始终包含角色名与作品名", () => {
    const p = buildCharacterSystemPrompt(base);
    expect(p).toContain("李墨");
    expect(p).toContain("《星辰》");
  });

  it("把关键角色字段拼进档案", () => {
    const p = buildCharacterSystemPrompt(base);
    expect(p).toContain("主角");
    expect(p).toContain("外冷内热");
    expect(p).toContain("铁匠铺出身");
    expect(p).toContain("步频幻觉");
    expect(p).toContain("寻找灭门仇人");
    expect(p).toContain("王五");
    expect(p).toContain("左脸刀疤");
    expect(p).toContain("哼，就这？");
  });

  it("对话模式强调第一人称口吻且限制长度", () => {
    const p = buildCharacterSystemPrompt({ ...base, mode: "dialogue" });
    expect(p).toContain("对话");
    expect(p).toContain("第一人称");
    expect(p).not.toContain("附身写作");
  });

  it("附身模式给出写作指令且不闲聊", () => {
    const p = buildCharacterSystemPrompt({ ...base, mode: "possess" });
    expect(p).toContain("附身写作");
    expect(p).toContain("正文");
    expect(p).not.toContain("用户会以读者或其他角色的身份和你对话");
  });

  it("缺字段时不崩，且能降级", () => {
    const p = buildCharacterSystemPrompt({ name: "路人", mode: "dialogue" });
    expect(p).toContain("路人");
    expect(p).not.toContain("undefined");
  });

  it("数组型 personality 也能拼", () => {
    const p = buildCharacterSystemPrompt({ name: "X", personality: ["毒舌", "护短"], mode: "dialogue" });
    expect(p).toContain("毒舌");
    expect(p).toContain("护短");
  });

  it("角色扮演铁律禁止跳出 AI 身份", () => {
    const p = buildCharacterSystemPrompt(base);
    expect(p).toContain("不能跳出角色");
    expect(p).toContain("我是AI");
  });

  it("导出模式常量完整", () => {
    expect(CHARACTER_CHAT_MODES).toEqual(["dialogue", "possess"]);
  });
});
