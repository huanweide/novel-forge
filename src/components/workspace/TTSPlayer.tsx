"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";

interface TTSPlayerProps {
  /** 待朗读文本（通常为正文 Markdown，组件内部会清洗标记） */
  text: string;
  /** 关闭控制条回调（如用户点 ×） */
  onClose?: () => void;
}

/**
 * 轻量清洗 Markdown 标记，避免朗读时把 **、*、#、> 这类符号也念出来。
 * 只做表层去除，不解析语义——朗读场景够用。
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`([^`]+)`/g, "$1") // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 链接 → 仅保留文字
    .replace(/^#{1,6}\s+/gm, "") // 标题 #
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // 粗体
    .replace(/(\*|_)(.*?)\1/g, "$2") // 斜体
    .replace(/^>\s?/gm, "") // 引用 >
    .replace(/^[-*+]\s+/gm, "") // 无序列表
    .replace(/^\d+\.\s+/gm, "") // 有序列表
    .replace(/[*_~`>#]/g, " ") // 残余符号
    .replace(/[ \t]{2,}/g, " ") // 多余空格
    .replace(/\n{2,}/g, "\n") // 多余空行
    .trim();
}

/**
 * AI 念书（语音朗读）控制条。
 * 依赖浏览器内置 Web Speech API（window.speechSynthesis），零依赖、零网络、零密钥。
 * 卸载时自动 cancel，避免声音泄漏到其它页面。
 */
export function TTSPlayer({ text, onClose }: TTSPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setUnsupported(true);
      return;
    }
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const all = synth.getVoices();
      // 优先中文语音：lang 含 zh / 名称含 中文/普通话/国语/Chinese
      const zh = all.filter((v) => /zh|chinese|中文|普通话|国语/i.test(v.lang + " " + v.name));
      const picked = zh.length ? zh : all;
      setVoices(picked);
      if (!voiceURI && picked.length) setVoiceURI(picked[0].voiceURI);
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, [voiceURI]);

  const plain = stripMarkdown(text);

  const stop = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const speak = () => {
    if (!plain.trim()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = rate;
    u.lang = "zh-CN";
    if (voiceURI) {
      const v = voices.find((x) => x.voiceURI === voiceURI);
      if (v) u.voice = v;
    }
    u.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    u.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utterRef.current = u;
    synth.speak(u);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const togglePlay = () => {
    if (!isPlaying) {
      speak();
    } else if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const btn =
    "flex items-center justify-center h-7 w-7 rounded-md border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-2)] transition-colors disabled:opacity-40";

  if (unsupported) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-2 text-xs text-[var(--nv-text-tertiary)]">
        <Icon name="radio" size={14} />
        当前浏览器或系统未提供语音合成能力，暂无法朗读（可换 Chrome / Edge 等现代浏览器试试）。
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-2.5 py-1.5">
      <button onClick={togglePlay} className={btn} title={isPlaying && !isPaused ? "暂停" : "朗读"} aria-label={isPlaying && !isPaused ? "暂停" : "朗读"}>
        <Icon name={isPlaying && !isPaused ? "pause" : "play"} size={14} />
      </button>
      <button onClick={stop} className={btn} disabled={!isPlaying} title="停止" aria-label="停止">
        <Icon name="stop" size={13} />
      </button>

      <div className="flex items-center gap-1.5 text-xs text-[var(--nv-text-tertiary)]">
        <span>语速</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={rate}
          onChange={(e) => {
            const r = parseFloat(e.target.value);
            setRate(r);
            if (utterRef.current) utterRef.current.rate = r;
          }}
          className="w-20 accent-[var(--nv-primary)]"
          aria-label="语速"
        />
        <span className="w-8 tabular-nums text-[var(--nv-text-secondary)]">{rate.toFixed(1)}x</span>
      </div>

      {voices.length > 1 && (
        <select
          value={voiceURI}
          onChange={(e) => setVoiceURI(e.target.value)}
          className="max-w-[140px] truncate rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-1.5 py-1 text-xs text-[var(--nv-text-primary)]"
          aria-label="音色"
          title="选择朗读音色"
        >
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}（{v.lang}）
            </option>
          ))}
        </select>
      )}

      {onClose && (
        <button onClick={onClose} className={btn} title="收起" aria-label="收起">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}
