import { describe, it, expect } from "vitest";
import { dedupeFacts, type RawFact } from "./extractFacts";

const mk = (subject: string, attribute: string, value: string): RawFact => ({
  category: "character",
  subject,
  attribute,
  value,
  source: "第3章",
  confidence: 1,
});

describe("dedupeFacts", () => {
  it("完全相同 subject+attribute 只保留首条", () => {
    const r = dedupeFacts([mk("林惊羽", "发色", "墨黑"), mk("林惊羽", "发色", "漆黑")]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe("墨黑"); // 首条胜出
  });

  it("不同 attribute 视为不同事实，全保留", () => {
    const r = dedupeFacts([mk("林惊羽", "发色", "墨黑"), mk("林惊羽", "瞳色", "灰")]);
    expect(r).toHaveLength(2);
  });

  it("大小写不敏感 + 忽略首尾空格", () => {
    const r = dedupeFacts([mk("林惊羽", "发色", "墨黑"), mk(" 林惊羽 ", " 发色 ", "漆黑")]);
    expect(r).toHaveLength(1);
    expect(r[0].subject).toBe("林惊羽");
    expect(r[0].attribute).toBe("发色");
  });

  it("空输入返回空", () => {
    expect(dedupeFacts([])).toEqual([]);
  });

  it("subject/attribute 含分隔符「|」时不误判为重複（key 用 JSON 序列化防歧义）", () => {
    const r = dedupeFacts([mk("甲|乙", "x", "一"), mk("甲", "乙|x", "二")]);
    // 旧实现 key=`甲|乙|x` 与 `甲|乙|x` 完全相撞，会误并为 1 条丢失真实事实
    expect(r).toHaveLength(2);
  });
});
