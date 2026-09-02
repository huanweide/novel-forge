// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HumanizePanel } from "./HumanizePanel";

/**
 * 这些用例守的是四条产品底线：
 *  1. 免责声明永远可见（不许藏起来，这是诚实性底线）
 *  2. 命中必须给证据（原文片段 + 原因 + 建议，不做黑箱评分）
 *  3. 不渲染时不许偷偷分析（open=false 应零计算）
 *  4. 样本不足时不给误导读数（字数太少直接说明，而不是报个 0 分让人以为写得好）
 *
 * 注意：Modal 用 createPortal 渲染到 document.body，断言一律走 screen / document.body，
 * 不要查 render() 返回的 container（那里是空的）。
 */

const AI_TEXT = [
  "值得注意的是，在这个喧嚣的世界里，李明不仅感到一种难以言喻的孤独，而且意识到自己必须做出改变。",
  "他缓缓地走在街道上——看着霓虹灯的闪烁——心中涌起复杂的情绪：愤怒、恐惧、绝望、不甘。",
  "这不仅仅关乎过去的回忆，而且关乎未来的选择，更是关乎当下的坚持。",
  "他不是一个轻言放弃的人，不是一个轻易妥协的人，不是一个甘于平庸的人。",
  "他微微一怔，深吸一口气，死死盯着那扇门，似乎在犹豫什么。",
].join("\n\n");

const HUMAN_TEXT =
  "李明朝地上啐了一口。走了。街灯坏了一半，忽明忽暗。他想起昨天那句话，越想越气。管他呢。明天的火车，爱几点几点。";

const LEVELS = ["基本干净", "轻微痕迹", "痕迹明显", "痕迹严重"];

function renderPanel(text: string, open = true) {
  return render(
    <HumanizePanel open={open} onClose={() => {}} text={text} chapterTitle="第三章 · 雨夜" />,
  );
}
/** 命中的「怎么改：」建议条数（文案前缀带「 · 」，故用正则） */
function adviceCount() {
  return screen.queryAllByText(/怎么改：/).length;
}

describe("HumanizePanel", () => {
  it("关闭时不渲染任何内容（也不做分析）", () => {
    const { container } = renderPanel(AI_TEXT, false);
    expect(container).toBeEmptyDOMElement();
  });

  it("打开后展示标题与检测对象", () => {
    renderPanel(AI_TEXT);
    expect(screen.getByText("本地过审自检")).toBeTruthy();
    expect(screen.getByText(/第三章 · 雨夜/)).toBeTruthy();
  });

  it("AI 腔文本不会被判成干净，并给出命中计数", () => {
    renderPanel(AI_TEXT);
    expect(screen.queryByText("基本干净")).toBeNull();
    expect(screen.getByText(/共 \d+ 处痕迹/)).toBeTruthy();
  });

  it("等级标签始终是四个合法值之一", () => {
    renderPanel(AI_TEXT);
    const shown = LEVELS.filter((l) => screen.queryByText(l));
    expect(shown).toHaveLength(1);
  });

  it("免责声明默认可见且写明不上传（诚实性底线）", () => {
    renderPanel(AI_TEXT);
    expect(screen.getByText(/不能保证通过任何平台的 AI 率审核/)).toBeTruthy();
    expect(screen.getByText(/不会上传到任何服务器/)).toBeTruthy();
  });

  it("每条命中都给出「为什么」和「怎么改」，不是只丢一个分数", () => {
    renderPanel(AI_TEXT);
    expect(screen.queryAllByText(/为什么：/).length).toBeGreaterThan(0);
    expect(adviceCount()).toBeGreaterThan(0);
  });

  it("命中原文被高亮标记（mark 元素，portal 在 body 下）", () => {
    renderPanel(AI_TEXT);
    expect(document.body.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("干净文本提示未检出痕迹", () => {
    renderPanel(HUMAN_TEXT);
    expect(screen.getByText(/没有检出 AI 痕迹/)).toBeTruthy();
  });

  it("字数过少时不给误导读数，提示先写够", () => {
    renderPanel("太短了。");
    expect(screen.getByText(/先写够 50 字再来自检/)).toBeTruthy();
  });

  it("展示可解释的原始数据，而不是只有总分", () => {
    renderPanel(AI_TEXT);
    for (const label of ["总字数", "破折号", "平均句长", "句长波动", "短句占比", "AI 词密度"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("「只看中/高严重度」开关能过滤低严重度命中", () => {
    renderPanel(AI_TEXT);
    const before = adviceCount();
    expect(before).toBeGreaterThan(0);
    const checkbox = screen.getByLabelText(/只看中\/高严重度/) as HTMLInputElement;
    fireEvent.click(checkbox);
    const after = adviceCount();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("点关闭触发 onClose", () => {
    const onClose = vi.fn();
    render(<HumanizePanel open onClose={onClose} text={AI_TEXT} />);
    fireEvent.click(screen.getByText("知道了"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
