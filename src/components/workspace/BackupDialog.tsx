"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { toastSuccess } from "@/components/ui/toast";

/**
 * 备份导出选择弹窗（v0.46.58）
 * 导出 .nfproject 前让用户勾选「保留哪些设定」——不再无脑全量导出。
 * 选中项经 ?include= 参数传给 backup API，未选中的不进入备份包。
 */
const EXPORT_ITEMS: { key: string; label: string; desc: string }[] = [
  { key: "characters", label: "角色卡", desc: "全部角色设定" },
  { key: "lorebook", label: "世界书词条", desc: "世界观/势力/宝物等词条" },
  { key: "chapters", label: "章节正文", desc: "全部章节（含大纲与正文）" },
  { key: "branches", label: "分支", desc: "故事分支节点" },
  { key: "storylines", label: "剧情线", desc: "主线/支线及七要素" },
  { key: "style", label: "文风卡", desc: "文风模板与风格卡" },
  { key: "tables", label: "世界表", desc: "结构化表格（宝宝流）" },
  { key: "rules", label: "正则规则", desc: "写作后处理正则" },
];

export function BackupDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(EXPORT_ITEMS.map((i) => i.key))
  );
  const [exporting, setExporting] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const doExport = () => {
    const chosen = EXPORT_ITEMS.filter((i) => selected.has(i.key)).map((i) => i.key);
    if (chosen.length === 0) return;
    setExporting(true);
    const a = document.createElement("a");
    a.href = `/api/projects/${projectId}/backup?include=${chosen.join(",")}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { setExporting(false); toastSuccess("备份包已开始下载"); onClose(); }, 600);
  };

  return (
    <Modal open onClose={onClose} bare ariaLabel="导出备份包" panelClassName="max-w-md max-h-[88vh] overflow-y-auto">
      <div className="p-5">
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)]">导出备份包</h3>
            <p className="mt-1 text-xs text-[var(--nv-text-tertiary)]">《{projectName}》— 勾选要保留的设定（默认全选）</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="关闭"><Icon name="x" size={16} /></button>
        </div>

        <div className="mt-4 space-y-1.5">
          {EXPORT_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] px-3 py-2.5 transition-colors hover:border-[var(--nv-border-3)]"
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="h-3.5 w-3.5 accent-[var(--nv-primary)]"
                />
                <span>
                  <span className="block text-xs font-medium text-[var(--nv-text-primary)]">{item.label}</span>
                  <span className="block text-[10px] text-[var(--nv-text-muted)]">{item.desc}</span>
                </span>
              </span>
              {selected.has(item.key) && <Icon name="check" size={12} className="text-[var(--nv-success)]" />}
            </label>
          ))}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
          未勾选的设定不会进入备份包；导入时按包内实际内容还原。
        </p>

        <p className="mt-2 text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
          本次备份包含：章节/角色/世界书/规则/文风/分支/剧情线/文风卡/世界表；不含：游戏进度/版本历史/记忆摘要/未收尾线索追踪/待兑现事项（请用文本导出迁移设定）。
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={doExport}
            disabled={selected.size === 0 || exporting}
            className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {exporting ? <span className="inline-flex items-center gap-1.5"><Icon name="loader" size={13} className="animate-spin" /> 导出中…</span> : <>导出 .nfproject（{selected.size} 项）</>}
          </button>
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2.5 text-sm">取消</button>
        </div>
      </div>
    </Modal>
  );
}
