import { Icon } from "@/components/ui/icons";
import type { ExtractionData, AdoptControllers } from "./types";

interface PlotTabProps {
  extractionData: ExtractionData;
  adopt: AdoptControllers;
}

/**
 * 情节 Tab —— 自动情节化的审阅/采纳界面。
 * 把抽取出的本章关键事件 (summary.keyEvents) 逐条展示，用户勾选后由全局「全部采纳」
 * 经 apply-extraction 写入故事线主线的 StorylineEvent（去重 + position 末尾）。
 */
export function PlotTab({ extractionData, adopt }: PlotTabProps) {
  const keyEvents: string[] = (extractionData.summary?.keyEvents || []).filter(
    (e: string) => typeof e === "string" && e.trim(),
  );

  if (keyEvents.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
        本章未抽取到关键事件（情节）。
        <br />
        可在「章节提取」确认抽取结果——抽取完成后这里会列出本章的关键情节，勾选即可归纳进故事线主线。
      </div>
    );
  }

  const selectedCount = keyEvents.filter((_: string, i: number) => adopt.plotEvents.set.has(String(i))).length;

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
        勾选要归纳进「故事线 · 主线」的关键事件，点击右上「全部采纳」即写入主线时间轴。
        <span className="text-[var(--nv-text-secondary)]"> 已采纳过的同一章节同事件不会重复添加。</span>
      </p>

      <div className="space-y-1.5">
        {keyEvents.map((ev: string, i: number) => {
          const isAdopted = adopt.plotEvents.set.has(String(i));
          return (
            <div
              key={i}
              className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${
                isAdopted
                  ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30"
                  : "bg-[var(--nv-surface-1)]"
              }`}
            >
              <button
                onClick={() => adopt.plotEvents.toggle(String(i))}
                className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                  ${
                    isAdopted
                      ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]"
                      : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"
                  }`}
              >
                {isAdopted ? <Icon name="check" size={11} /> : null}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-[var(--nv-text-secondary)]">
                  <span className="text-[var(--nv-text-tertiary)] mr-1">{i + 1}.</span>
                  {ev}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-[var(--nv-text-tertiary)]">
        已选 {selectedCount} / {keyEvents.length} 条 · 采纳后可在「故事线工作台」查看并标注叙事角色（推进点/卡点/分支）
      </p>
    </div>
  );
}
