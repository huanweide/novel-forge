"use client";

/**
 * OnboardingModal — 首次进入工作区的新手引导弹窗（PROCESS/06 P2-3）
 *
 * 复用统一 Modal（自带焦点陷阱 / ESC / 遮罩关闭 / 滚动锁定）。
 * 首次访问（localStorage 无标记）才显示，关闭后写入标记，永不重复打扰；
 * localStorage 不可用时静默忽略，不阻断正常使用。纯前端、零 schema 变更。
 */

import { useEffect, useState } from "react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";

const ONBOARD_KEY = "nf_onboarded_v1";

const STEPS: { n: number; title: string; desc: string }[] = [
  { n: 1, title: "选个开局", desc: "首页点「看示例」载入示范仙侠小说，或「按题材开局」一键建好项目骨架。" },
  { n: 2, title: "让 AI 写", desc: "选中章节，点「续写 / 微调」，AI 会带着你的世界观与角色自动写。" },
  { n: 3, title: "导出成书", desc: "工具栏「导出」选 Word / EPUB，直接拿去投稿或阅读。" },
];

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "bot", title: "自动化填表", desc: "AI 写完一章，自动把人物、设定、伏笔整理进结构化表格，零配置。" },
  { icon: "gem", title: "抽卡剧情", desc: "用「抽卡」随机生成剧情走向，并关联你的角色与故事线。" },
  { icon: "clipboard", title: "拆解大纲", desc: "一键把粗略想法拆成卷纲 → 章纲，逐级展开。" },
  { icon: "star", title: "竞品借鉴打磨", desc: "已补齐导出 HTML/EPUB、实体徽章、快捷芯片、叙事视角等体验。" },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !localStorage.getItem(ONBOARD_KEY)) {
        setOpen(true);
      }
    } catch {
      /* localStorage 不可用时静默忽略，不阻断正常使用 */
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* 忽略写入失败 */
    }
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="欢迎来到小说工坊"
      description="下面几个核心功能，帮你更快进入状态。看完点「开始创作」即可，不影响任何已有内容。"
      icon="book"
      size="lg"
    >
      {/* 三步上手路径 */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--nv-primary)] text-[10px] font-bold text-white">{s.n}</span>
              <span className="text-xs font-medium text-[var(--nv-text-primary)]">{s.title}</span>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3 rounded-xl bg-[var(--nv-surface-1)] p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]">
              <Icon name={f.icon} size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--nv-text-primary)]">{f.title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-[var(--nv-text-tertiary)]">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <ModalFooter>
        <Button onClick={dismiss}>开始创作 →</Button>
      </ModalFooter>
    </Modal>
  );
}

export default OnboardingModal;
