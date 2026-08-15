"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { segmentText, stripMarkdown } from "@/lib/stripMarkdown";

interface TTSPlayerProps {
  /** 待朗读文本（通常为正文 Markdown，组件内部会清洗标记） */
  text: string;
  /** 章节标题，用作开头报幕（「第一章 XXX」） */
  title?: string;
  /** 关闭控制条回调（如用户点 ×） */
  onClose?: () => void;
}

const TTS_PREFS_KEY = "nf_tts_prefs";
const TTS_RESUME_PREFIX = "nf_tts_resume_";
function loadTTSPrefs(): { rate?: number; voiceURI?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TTS_PREFS_KEY);
    return raw ? (JSON.parse(raw) as { rate?: number; voiceURI?: string }) : {};
  } catch {
    return {};
  }
}
function saveTTSPrefs(p: { rate?: number; voiceURI?: string }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TTS_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式 / 配额满 时静默忽略 */
  }
}
function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * AI 念书（语音朗读）控制条。
 * 依赖浏览器内置 Web Speech API（window.speechSynthesis），零依赖、零网络、零密钥。
 * v2.46 升级：整章切句分段朗读 + 进度条 + 上/下句跳转 + 章节报幕 + localStorage 续播位置。
 * 卸载时自动 cancel，避免声音泄漏到其它页面。
 */
export function TTSPlayer({ text, title, onClose }: TTSPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const initialPrefs = loadTTSPrefs();
  const [voiceURI, setVoiceURI] = useState<string>(initialPrefs.voiceURI || "");
  const [rate, setRate] = useState<number>(
    initialPrefs.rate && initialPrefs.rate >= 0.5 && initialPrefs.rate <= 2
      ? initialPrefs.rate
      : 1,
  );
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const statusRef = useRef<"idle" | "playing" | "paused">("idle");
  const stoppedRef = useRef(false);

  // 章节内容 → 清洗（保留段落）→ 切句；标题作为第 0 句报幕
  const segments = useMemo(() => {
    const plain = stripMarkdown(text, { preserveParagraphs: true });
    const arr = title?.trim() ? [`「${title.trim()}」`] : [];
    return [...arr, ...segmentText(plain)];
  }, [text, title]);

  const resumeKey = useMemo(
    () => (typeof window !== "undefined" ? TTS_RESUME_PREFIX + hashStr((title || "") + "\u0001" + text) : ""),
    [text, title],
  );

  // 挂载时恢复续播位置（仅定位，不自动播放；用户按播放从断点继续）
  useEffect(() => {
    if (!resumeKey || segments.length === 0) return;
    try {
      const raw = window.localStorage.getItem(resumeKey);
      if (raw) {
        const saved = JSON.parse(raw) as { i?: number };
        if (typeof saved.i === "number" && saved.i > 0 && saved.i < segments.length) {
          setCurrentIndex(saved.i);
        }
      }
    } catch {
      /* 忽略损坏的续播记录 */
    }
    // 仅在内容变化时重新定位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeKey]);

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
      const savedUri = loadTTSPrefs().voiceURI;
      const savedMatch = savedUri && picked.find((v) => v.voiceURI === savedUri);
      if (savedMatch) {
        setVoiceURI(savedUri);
      } else if (!voiceURI || !picked.find((v) => v.voiceURI === voiceURI)) {
        setVoiceURI(picked.length ? picked[0].voiceURI : "");
      }
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, [voiceURI]);

  const saveResume = (i: number) => {
    if (!resumeKey) return;
    try {
      window.localStorage.setItem(resumeKey, JSON.stringify({ i }));
    } catch {
      /* 忽略 */
    }
  };
  const clearResume = () => {
    if (!resumeKey) return;
    try {
      window.localStorage.removeItem(resumeKey);
    } catch {
      /* 忽略 */
    }
  };

  const speakSegment = (i: number) => {
    if (i < 0 || i >= segments.length) {
      // 自然结束
      statusRef.current = "idle";
      setStatus("idle");
      setCurrentIndex(0);
      clearResume();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    setCurrentIndex(i);
    saveResume(i);
    statusRef.current = "playing";
    setStatus("playing");
    stoppedRef.current = false;
    const u = new SpeechSynthesisUtterance(segments[i]);
    u.rate = rate;
    u.lang = "zh-CN";
    if (voiceURI) {
      const v = voices.find((x) => x.voiceURI === voiceURI);
      if (v) u.voice = v;
    }
    u.onend = () => {
      if (stoppedRef.current || statusRef.current !== "playing") return;
      speakSegment(i + 1);
    };
    u.onerror = () => {
      if (stoppedRef.current) return;
      statusRef.current = "idle";
      setStatus("idle");
    };
    utterRef.current = u;
    synth.speak(u);
  };

  const startFrom = (i: number) => {
    if (segments.length === 0) return;
    speakSegment(i);
  };

  const togglePlay = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (status === "playing") {
      window.speechSynthesis.pause();
      statusRef.current = "paused";
      setStatus("paused");
    } else if (status === "paused") {
      window.speechSynthesis.resume();
      statusRef.current = "playing";
      setStatus("playing");
    } else {
      startFrom(currentIndex >= segments.length ? 0 : currentIndex);
    }
  };

  const stop = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      stoppedRef.current = true;
      window.speechSynthesis.cancel();
    }
    statusRef.current = "idle";
    setStatus("idle");
    setCurrentIndex(0);
    clearResume();
  };

  const jump = (delta: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const target = Math.min(Math.max(currentIndex + delta, 0), segments.length - 1);
    stoppedRef.current = false;
    speakSegment(target);
  };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (segments.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.min(Math.max(Math.round(ratio * (segments.length - 1)), 0), segments.length - 1);
    stoppedRef.current = false;
    speakSegment(i);
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

  const total = segments.length;
  const progress = total > 0 ? ((currentIndex + (status === "idle" ? 0 : 1)) / total) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-2.5 py-1.5">
      <button onClick={() => jump(-1)} className={btn} disabled={total === 0 || currentIndex === 0} title="上一句" aria-label="上一句">
        <Icon name="arrowLeft" size={14} />
      </button>
      <button onClick={togglePlay} className={btn} disabled={total === 0} title={status === "playing" ? "暂停" : status === "paused" ? "继续" : "朗读"} aria-label={status === "playing" ? "暂停" : "朗读"}>
        <Icon name={status === "playing" ? "pause" : "play"} size={14} />
      </button>
      <button onClick={() => jump(1)} className={btn} disabled={total === 0 || currentIndex >= total - 1} title="下一句" aria-label="下一句">
        <Icon name="arrowRight" size={14} />
      </button>
      <button onClick={stop} className={btn} disabled={status === "idle"} title="停止" aria-label="停止">
        <Icon name="stop" size={13} />
      </button>

      {total > 0 && (
        <div className="flex min-w-[120px] flex-1 items-center gap-2">
          <div
            onClick={onTrackClick}
            className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-[var(--nv-border-2)]"
            title="点击跳转到对应句子"
            role="slider"
            aria-label="朗读进度"
            aria-valuemin={0}
            aria-valuemax={total - 1}
            aria-valuenow={currentIndex}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-[var(--nv-primary)]"
              style={{ width: `${Math.max(progress, total > 0 ? 100 / total : 0)}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--nv-text-tertiary)]">
            {Math.min(currentIndex + (status === "idle" ? 0 : 1), total)}/{total}
          </span>
        </div>
      )}

      {status !== "idle" && (
        <span className="text-xs font-medium text-[var(--nv-primary)]">
          {status === "paused" ? "已暂停" : "朗读中"}
        </span>
      )}

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
            saveTTSPrefs({ rate: r, voiceURI });
          }}
          className="w-20 accent-[var(--nv-primary)]"
          aria-label="语速"
        />
        <span className="w-8 tabular-nums text-[var(--nv-text-secondary)]">{rate.toFixed(1)}x</span>
      </div>

      {voices.length > 1 && (
        <select
          value={voiceURI}
          onChange={(e) => {
            const v = e.target.value;
            setVoiceURI(v);
            saveTTSPrefs({ rate, voiceURI: v });
          }}
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
