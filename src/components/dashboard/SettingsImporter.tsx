"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

type ParseMode = "all" | "lorebook" | "style";

const MODE_OPTIONS: { mode: ParseMode; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    mode: "all",
    label: "全部三卡",
    desc: "角色卡 + 世界书 + 风格卡，一键全出",
    icon: <Icon name="grid" size={18} />,
  },
  {
    mode: "lorebook",
    label: "仅世界卡",
    desc: "复述蒸馏——提取全部世界观设定，不总结不压缩",
    icon: <Icon name="book" size={18} />,
  },
  {
    mode: "style",
    label: "仅风格卡",
    desc: "复述蒸馏——分析全部风格维度 + 提取写作规则",
    icon: <Icon name="palette" size={18} />,
  },
];

/**
 * 设定批量导入弹窗 — v3
 *
 * 三种解析模式：
 * - 全部三卡（默认）
 * - 仅世界卡（复述蒸馏世界观设定）
 * - 仅风格卡（分析风格维度 + 写作规则）
 */
export function SettingsImporter({
  projectId,
  onClose,
  onImported,
}: {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<ParseMode>("all");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{
    characters: number;
    loreEntries: number;
    styleCard: boolean;
    writingRules: number;
    synopsis: string;
    mode: string;
  } | null>(null);
  const [error, setError] = useState("");

  const handleParse = async () => {
    if (!rawText.trim()) return;

    setParsing(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/parse-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          rawText,
          mode,
          autoCreate: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "解析失败");
      }

      const data = await res.json();
      setResult({
        characters: data.created.characters || 0,
        loreEntries: data.created.loreEntries || 0,
        styleCard: data.created.styleCard || false,
        writingRules: data.parsed?.writingRules?.length || 0,
        synopsis: data.parsed?.synopsis || "",
        mode: data.mode || mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsing(false);
    }
  };

  const handleDone = () => {
    onImported();
    onClose();
  };

  const modeInfo = MODE_OPTIONS.find((m) => m.mode === mode)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Icon name="clipboard" size={18} /> 批量导入设定</h2>
          <button onClick={onClose} className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)]">
            ✕
          </button>
        </div>

        {/* 模式选择器 */}
        <div className="flex gap-2 mb-4">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setMode(opt.mode)}
              disabled={parsing}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm text-left transition-all border ${
                mode === opt.mode
                  ? "bg-[var(--nv-primary)]/50 border-[var(--nv-primary)]/50 text-[var(--nv-primary)]"
                  : "bg-[var(--nv-surface-3)]/50 border-[var(--nv-border-2)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] hover:border-[var(--nv-border-3)]"
              }`}
            >
              <div className="font-medium">
                {opt.icon} {opt.label}
              </div>
              <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>

        <p className="text-sm text-[var(--nv-text-muted)] mb-4">
          {mode === "all" &&
            "把你写好的世界观、角色设定、大纲等任意文本贴进来。AI 自动识别角色、组织、地点、魔法体系等，拆成三张卡。"}
          {mode === "lorebook" &&
            "专注提取世界观设定。复述原文细节——不总结、不压缩、不省略。去重去矛盾，分类组织。地理/势力/力量体系/历史/文化/生物/器物，不漏一条。"}
          {mode === "style" &&
            "专注分析写作风格。覆盖视角/叙事距离/句式/比例/语气/词汇全部维度。如果原文有明确的写作规则，逐条提取。"}
          <br />
          <span className="text-[var(--nv-primary)]">支持几万字的文本，格式不限。越详细越好。</span>
        </p>

        {!result ? (
          <>
            <textarea
              className="flex-1 min-h-[260px] bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--nv-primary)] font-mono leading-relaxed"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`在这里粘贴你的${mode === "lorebook" ? "世界观设定" : mode === "style" ? "文本（用于分析风格）" : "设定文本"}...

${
  mode === "lorebook"
    ? `示例：
世界分三界：人界、仙界、魔界。仙界之门每千年开启一次，开启时天地异象、灵气暴涌。
灵脉修炼体系分九品，每打通一品实力暴涨。但修炼过度会导致"灵爆"——灵脉炸裂、修为尽废。
青云宗坐落于青云山脉，是正道第一宗派，门规森严。宗主慕容白表面公正，暗中收集灵脉碎片。`
    : mode === "style"
    ? `示例：
他的指尖触到她腕间脉搏。她没动，呼吸却乱了半拍。窗外风铃轻响，遮住了她喉间那声压下去的叹息。
"你怕我。"
"……没有。"
他笑了。不是温柔的笑——是猎手确认猎物入网的笃定。她后槽牙咬紧，指甲掐进掌心。对，我怕你。但这话她永远不会说出口。`
    : `示例：
主角叫林逸，22岁，剑客。性格孤傲冷峻，话少但每句都扎心。
口头禅："废话少说。" "你挡我路了。"
曾经是青云宗的天才弟子，因被诬陷叛逃师门，从此浪迹天涯。

世界分三界：人界、仙界、魔界。仙界之门每千年开启一次。
灵脉分九品，每打通一品实力暴涨。修炼过度会导致"灵爆"。`
}
`}
            />

            {error && (
              <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4 shrink-0">
              <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">
                取消
              </Button>
              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || parsing}
                className="bg-[var(--nv-primary)] hover:brightness-110 disabled:opacity-50"
              >
                {parsing
                  ? <span className="flex items-center gap-1.5"><Icon name="bot" size={14} /> AI 正在{mode === "lorebook" ? "蒸馏世界观" : mode === "style" ? "分析风格" : "解析"}中...</span>
                  : <span className="flex items-center gap-1.5">{modeInfo.icon} 开始{mode === "lorebook" ? "蒸馏世界设定" : mode === "style" ? "分析写作风格" : "解析全部三卡"}</span>}
              </Button>
            </div>
          </>
        ) : (
          /* 解析结果 */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-semibold mb-2">
              {result.mode === "lorebook"
                ? "世界观蒸馏完成！"
                : result.mode === "style"
                ? "风格分析完成！"
                : "解析完成！"}
            </h3>
            <div className="space-y-2 text-sm text-[var(--nv-text-tertiary)] mb-6">
              {result.characters > 0 && (
                <p>
                  创建了 <span className="text-[var(--nv-primary)] font-bold">{result.characters}</span> 个角色卡
                </p>
              )}
              {result.loreEntries > 0 && (
                <p>
                  创建了 <span className="text-green-400 font-bold">{result.loreEntries}</span> 个世界书词条
                </p>
              )}
              {result.styleCard && (
                <p>
                  创建了 <span className="text-pink-400 font-bold">1</span> 张风格卡
                </p>
              )}
              {result.writingRules > 0 && (
                <p>
                  提取了 <span className="text-amber-400 font-bold">{result.writingRules}</span> 条写作规则
                </p>
              )}
              {result.synopsis && (
                <p className="text-[var(--nv-text-muted)] mt-2 max-w-md">
                  <span className="flex items-center gap-1"><Icon name="pin" size={12} /> 自动提取总纲：{result.synopsis.slice(0, 100)}...</span>
                </p>
              )}
            </div>
            <Button onClick={handleDone} className="bg-[var(--nv-primary)] hover:brightness-110">
              完成，返回工作台
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
