import { describe, it, expect } from "vitest";
import { isSimilarName } from "./entity-auto-creator";

// 验证 entity-auto-creator 的相似名去重（尤其中文短名繁简归一化，青砚 P2）。
describe("isSimilarName —— 短名繁简去重", () => {
  it("2字繁简变体判重复（萧炎/蕭炎）", () => {
    expect(isSimilarName("萧炎", "蕭炎")).toBe(true);
    expect(isSimilarName("蕭炎", "萧炎")).toBe(true);
  });

  it("2字无关词不误并（白云/白衣，证明未引入编辑距离）", () => {
    expect(isSimilarName("白云", "白衣")).toBe(false);
  });

  it("2字纯错字不去重（叶凡/叶帆，已知留待后续）", () => {
    expect(isSimilarName("叶凡", "叶帆")).toBe(false);
  });

  it("长名编辑距离≤1 仍判重复（青龙镇/青龍镇）", () => {
    expect(isSimilarName("青龙镇", "青龍镇")).toBe(true);
  });
});
