"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 设定批量导入弹窗
 *
 * 用户贴一大段文本（大纲、角色介绍、世界观等），
 * AI 自动拆成结构化的人物卡 + 世界书词条。
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
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{
    characters: number;
    loreEntries: number;
    synopsis: string;
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
          autoCreate: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "解析失败");
      }

      const data = await res.json();
      setResult({
        characters: data.created.characters,
        loreEntries: data.created.loreEntries,
        synopsis: data.parsed.synopsis || "",
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">📋 批量导入设定</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-500 mb-4">
          把你写好的世界观、角色设定、大纲等任意文本贴进来。
          AI 会自动识别其中的角色、组织、地点、魔法体系等，拆成结构化卡片。
          <br />
          <span className="text-indigo-400">
            支持几万字的设定文本，格式不限。越详细越好。
          </span>
        </p>

        {!result ? (
          <>
            <textarea
              className="flex-1 min-h-[300px] bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`在这里粘贴你的设定文本...

示例格式（任何格式都可以）：
---
主角叫林逸，22岁，剑客。性格孤傲冷峻，话少但每句都扎心。
口头禅："废话少说。" "你挡我路了。"
曾经是青云宗的天才弟子，因被诬陷叛逃师门，从此浪迹天涯。
暗中追查当年陷害自己的真凶。

世界分三界：人界、仙界、魔界。仙界之门每千年开启一次。
魔法体系叫"灵脉"，修炼者通过打通体内灵脉获得超凡力量。
灵脉分九品，每打通一品实力暴涨。
灵脉修炼过度会导致"灵爆"，整个人炸成碎片。

青云宗是正道第一宗派，坐落于青云山脉，门规森严。
宗主叫慕容白，表面公正严明，实则在暗中收集灵脉碎片。
---
`}
            />

            {error && (
              <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4 shrink-0">
              <Button variant="outline" onClick={onClose} className="border-zinc-700">
                取消
              </Button>
              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || parsing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              >
                {parsing ? "🤖 AI 正在解析中..." : "🤖 开始解析"}
              </Button>
            </div>
          </>
        ) : (
          /* 解析结果 */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-semibold mb-2">解析完成！</h3>
            <div className="space-y-2 text-sm text-zinc-400 mb-6">
              <p>
                创建了 <span className="text-indigo-400 font-bold">{result.characters}</span> 个角色卡
              </p>
              <p>
                创建了 <span className="text-green-400 font-bold">{result.loreEntries}</span> 个世界书词条
              </p>
              {result.synopsis && (
                <p className="text-zinc-500 mt-2 max-w-md">
                  📌 自动提取总纲：{result.synopsis.slice(0, 100)}...
                </p>
              )}
            </div>
            <Button onClick={handleDone} className="bg-indigo-600 hover:bg-indigo-500">
              完成，返回工作台
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
