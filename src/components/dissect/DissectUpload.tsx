"use client";

import { useState, useRef, useCallback } from "react";

interface DissectUploadProps {
  onStart: (data: {
    taskName: string;
    bookName: string;
    bookAuthor: string;
    originalText: string;
    depth: string;
    extractChapterSummaries: boolean;
  }) => void;
  loading?: boolean;
}

export function DissectUpload({ onStart, loading }: DissectUploadProps) {
  const [taskName, setTaskName] = useState("");
  const [bookName, setBookName] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [text, setText] = useState("");
  const [depth, setDepth] = useState("standard");
  const [extractSummaries, setExtractSummaries] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 自动从文件名提取书名
      const nameWithoutExt = file.name.replace(/\.(txt|md)$/i, "");
      if (!bookName) setBookName(nameWithoutExt);
      if (!taskName) setTaskName(`拆解-${nameWithoutExt}`);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setText(content);
      };
      reader.onerror = () => {
        alert("文件读取失败，请确认是 UTF-8 编码的文本文件");
      };
      reader.readAsText(file, "UTF-8");
    },
    [bookName, taskName],
  );

  const handlePaste = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
    },
    [],
  );

  const canStart =
    text.trim().length >= 100 &&
    (taskName.trim() || bookName.trim()) &&
    !loading;

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      taskName: taskName.trim(),
      bookName: bookName.trim() || taskName.trim(),
      bookAuthor: bookAuthor.trim(),
      originalText: text.trim(),
      depth,
      extractChapterSummaries: extractSummaries,
    });
  };

  return (
    <div className="space-y-6">
      {/* 元数据 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">
            任务名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="为本次拆书取个名字..."
            className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">原书名称</label>
          <input
            type="text"
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
            placeholder="原著书名"
            className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">原书作者</label>
          <input
            type="text"
            value={bookAuthor}
            onChange={(e) => setBookAuthor(e.target.value)}
            placeholder="原著作者"
            className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 输入模式切换 */}
      <div className="flex gap-1 bg-white/[0.03] backdrop-blur-sm rounded-lg p-1 w-fit">
        <button
          onClick={() => setInputMode("file")}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            inputMode === "file"
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:text-zinc-300"
          }`}
        >
          文件上传
        </button>
        <button
          onClick={() => setInputMode("paste")}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            inputMode === "paste"
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:text-zinc-300"
          }`}
        >
          粘贴文本
        </button>
      </div>

      {/* 文件上传 / 粘贴区域 */}
      {inputMode === "file" ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-white/[0.08] rounded-xl p-12 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="text-4xl mb-3">📄</div>
          <p className="text-zinc-400 text-sm">
            拖拽 .txt 文件到此处，或点击选择文件
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            支持 UTF-8 编码的纯文本文件
          </p>
          {text && (
            <div className="mt-3 text-xs text-green-500">
              ✅ 已加载 {text.length.toLocaleString()} 字
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={text}
          onChange={handlePaste}
          placeholder="在此粘贴小说全文..."
          rows={12}
          className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-y"
        />
      )}

      {/* 拆解深度 */}
      <div>
        <label className="block text-sm text-zinc-400 mb-2">拆解深度</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              id: "quick",
              label: "快速",
              desc: "提取核心要素，速度最快",
            },
            {
              id: "standard",
              label: "标准",
              desc: "均衡分析，推荐选择",
            },
            {
              id: "deep",
              label: "精细",
              desc: "深度拆解，最为详尽",
            },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setDepth(opt.id)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                depth === opt.id
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-white/[0.08] bg-white/[0.03] backdrop-blur-sm hover:border-zinc-600"
              }`}
            >
              <div className="text-sm font-medium text-zinc-200">
                {opt.label}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 逐章摘要 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={extractSummaries}
          onChange={(e) => setExtractSummaries(e.target.checked)}
          className="w-4 h-4 rounded border-white/[0.08] bg-white/[0.03] backdrop-blur-sm accent-indigo-500"
        />
        <span className="text-sm text-zinc-400">
          提取章节摘要
          <span className="text-zinc-600 ml-1">
            （为每一章独立提取一条大纲摘要，默认关闭）
          </span>
        </span>
      </label>

      {/* 提交按钮 */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
          canStart
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            拆解中...
          </span>
        ) : (
          "开始拆解"
        )}
      </button>
    </div>
  );
}
