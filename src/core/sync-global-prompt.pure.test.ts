import { describe, it, expect } from "vitest";
import { dedupeLore, hardTruncate } from "@/core/sync-global-prompt";

// v2.53.0：给 globalPrompt 聚合摘要的两个底层纯函数补直接单测，
// 锁死「世界卡去重」与「预算兜底截断」的确定性契约——这俩函数决定
// 用户世界设定会不会被静默丢弃、写作提示词会不会超上下文窗或断半句。
// 此前只有 buildGlobalPrompt 整体 5 例间接覆盖，确定性边界未钉死。

describe("dedupeLore 世界卡去重 (v2.53.0)", () => {
  it("空数组返回空数组", () => {
    expect(dedupeLore([])).toEqual([]);
  });

  it("单条原样返回", () => {
    const e = { title: "设定1", category: "magic_system", content: "内容" };
    expect(dedupeLore([e])).toEqual([e]);
  });

  it("同 title 两条，长内容覆盖短内容", () => {
    const r = dedupeLore([
      { title: "龙骨滩", category: "geography", content: "短" },
      { title: "龙骨滩", category: "geography", content: "这是更长的内容，描述该地点的地理与传说，应保留这条" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe("这是更长的内容，描述该地点的地理与传说，应保留这条");
  });

  it("同 title 三条，只留最长一条（不重复不丢）", () => {
    const r = dedupeLore([
      { title: "印记", category: "item", content: "甲" },
      { title: "印记", category: "item", content: "乙中等长度" },
      { title: "印记", category: "item", content: "丙这是三条里最长的一条内容应当被保留" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe("丙这是三条里最长的一条内容应当被保留");
  });

  it("同 title 第一条更长时不被第二条短内容覆盖", () => {
    const r = dedupeLore([
      { title: "X", category: "custom", content: "长内容第一条应当保留" },
      { title: "X", category: "custom", content: "短" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe("长内容第一条应当保留");
  });

  it("无 title 且同 category + 同内容前缀（超40字），只留第一条（不重复堆叠）", () => {
    const longContent = "相同的引用内容前缀部分足够长以至于超过四十字用于验证引用去重是否真的生效了啊啊啊";
    const r = dedupeLore([
      { title: "", category: "custom", content: longContent },
      { title: "", category: "custom", content: longContent + "但后面追加了不同内容导致整条更长" },
    ]);
    expect(r).toHaveLength(1);
  });

  it("无 title 同 category 但内容前缀不同，两条都保留（不丢数据）", () => {
    const r = dedupeLore([
      { title: "", category: "custom", content: "内容A开头完全不同这里用来区分" },
      { title: "", category: "custom", content: "内容B开头完全不同这里用来区分" },
    ]);
    expect(r).toHaveLength(2);
  });

  it("title 前后空格 trim 后碰撞，按去重处理", () => {
    const r = dedupeLore([
      { title: " 龙骨滩 ", category: "geography", content: "短" },
      { title: "龙骨滩", category: "geography", content: "这是更长的内容应保留" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe("这是更长的内容应保留");
  });

  it("无 title 但 category 不同，同内容前缀不误并（两条都留）", () => {
    const r = dedupeLore([
      { title: "", category: "custom", content: "相同内容前缀跨类别不应合并保存" },
      { title: "", category: "geography", content: "相同内容前缀跨类别不应合并保存" },
    ]);
    expect(r).toHaveLength(2);
  });
});

describe("hardTruncate 预算兜底截断 (v2.53.0)", () => {
  it("不超预算时原样返回", () => {
    expect(hardTruncate("短文本", 100)).toBe("短文本");
  });

  it("刚好等于预算时原样返回", () => {
    const s = "字".repeat(14000);
    expect(hardTruncate(s, 14000)).toBe(s);
  });

  it("超预算且最后一个换行落在预算 80% 之后：在换行处切断、不切半句", () => {
    const s = "字".repeat(13000) + "\n" + "字".repeat(1000) + "标记后段XYZ";
    const r = hardTruncate(s, 14000);
    expect(r.length).toBeLessThanOrEqual(14000);
    expect(r).toContain("（全局设定因体量已智能精简");
    expect(r.endsWith("面板）")).toBe(true);
    expect(r).not.toContain("标记后段XYZ"); // 在 \n 处切断，\n 之后内容被丢弃
  });

  it("超预算但换行在预算 80% 之前：切到预算边界、保留前方段落", () => {
    const s = "前段一\n前段二\n" + "字".repeat(20000);
    const r = hardTruncate(s, 14000);
    expect(r.length).toBeLessThanOrEqual(14000);
    expect(r).toContain("前段二"); // 前方段落与换行被保留（切在预算边界而非换行）
    expect(r.endsWith("面板）")).toBe(true);
  });

  it("超预算无换行（单整段）：总长恰好等于预算、以后缀结尾", () => {
    const s = "字".repeat(20000);
    const r = hardTruncate(s, 14000);
    expect(r.length).toBe(14000);
    expect(r.endsWith("面板）")).toBe(true);
  });

  it("预算等于后缀长度边界：总长不超预算、以后缀结尾", () => {
    const suffix = "\n\n# （全局设定因体量已智能精简，完整体请见「角色卡 / 世界书」面板）";
    const r = hardTruncate("字".repeat(5000), suffix.length);
    expect(r.length).toBeLessThanOrEqual(suffix.length);
    expect(r.endsWith(suffix)).toBe(true);
  });
});
