import { describe, it, expect } from "vitest";
import { injectContextBlocks } from "./instruction-context";

describe("injectContextBlocks（v1.8.24 上下文注入尾部组装）", () => {
  it("按数组顺序追加非空块，每块前以空行分隔", () => {
    const base = "【写作指令】写下一章";
    const digest = "【长期记忆摘要】此前各章发生了什么";
    const stage = "【全书进度阶段：开篇（约 8% 完成）】严禁揭晓终局";
    const out = injectContextBlocks(base, [digest, stage]);
    expect(out).toBe(`${base}\n\n${digest}\n\n${stage}`);
  });

  it("digest 在前、stage 在后，顺序与三路由一致", () => {
    const out = injectContextBlocks("base", ["DIGEST", "STAGE"]);
    expect(out.indexOf("DIGEST")).toBeLessThan(out.indexOf("STAGE"));
  });

  it("跳过 null / undefined / 空串块，不污染 prompt", () => {
    const base = "base";
    const out = injectContextBlocks(base, [null, undefined, "", "   ", "ONLY"]);
    expect(out).toBe("base\n\nONLY");
  });

  it("所有块都为空时原样返回基准", () => {
    expect(injectContextBlocks("base", [null, undefined, ""])).toBe("base");
  });

  it("单块追加：仅 digest（无 stage）", () => {
    expect(injectContextBlocks("base", ["DIGEST"])).toBe("base\n\nDIGEST");
  });

  it("单块追加：仅 stage（无 digest）", () => {
    expect(injectContextBlocks("base", [undefined, "STAGE"])).toBe("base\n\nSTAGE");
  });

  it("真实组合：digest + stage 都非空，恰为 write/refine/continue 的实际调用形态", () => {
    const writingInstruction = "【格式铁律前】正文";
    const digestBlock =
      "【长期记忆摘要——时间线】第 1-5 章：主角建立世界观…\n【故事线】主线在推进";
    const stageBlock = "【全书进度阶段：早期发展（约 20% 完成）】严禁让核心冲突提前进入决战状态";
    const out = injectContextBlocks(writingInstruction, [digestBlock, stageBlock]);
    expect(out).toContain(digestBlock);
    expect(out).toContain(stageBlock);
    // stage 必须出现在 digest 之后（防抢跑指令紧邻格式铁律之前）
    expect(out.indexOf(stageBlock)).toBeGreaterThan(out.indexOf(digestBlock));
    // 块之间以空行分隔，无多余空行
    expect(out).not.toContain("\n\n\n");
  });
});
