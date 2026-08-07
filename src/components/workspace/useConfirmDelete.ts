"use client";

import { useState, useCallback } from "react";
import { confirmDialog, toast, toastError, toastSuccess } from "@/components/ui/toast";

interface UseConfirmDeleteOptions {
  /** 确认弹窗标题 */
  title: string;
  /** 确认弹窗描述，支持函数以拼入 id / name */
  description: string | ((id: string, name?: string) => string);
  /** 真正的删除请求；resolve 即成功，throw 即失败（hook 会自动 toast） */
  deleteFn: (id: string) => Promise<void>;
  /** 成功后的本地刷新 / 列表过滤 */
  onSuccess?: (id: string) => void;
  /** 失败 toast 前缀，默认「删除失败」 */
  errorPrefix?: string;
  /** 成功 toast 文案，默认「已删除」 */
  successMessage?: string;
  /** 可选「撤销」动作（如软删除后的恢复），点击即执行 run(id) */
  undo?: { label: string; run: (id: string) => void | Promise<void> };
}

/**
 * 统一的「确认删除」逻辑：一次封装 confirmDialog + loading 态 + 错误 toast，
 * 消除各列表组件里近重复的删除样板代码。
 */
export function useConfirmDelete(opts: UseConfirmDeleteOptions) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = useCallback(
    async (id: string, name?: string) => {
      const desc =
        typeof opts.description === "function"
          ? opts.description(id, name)
          : opts.description;
      if (
        !(await confirmDialog({
          title: opts.title,
          description: desc,
          danger: true,
        }))
      ) {
        return;
      }
      setDeletingId(id);
      try {
        await opts.deleteFn(id);
        opts.onSuccess?.(id);
        if (opts.undo) {
          toast({
            type: "success",
            description: opts.successMessage ?? "已删除",
            action: { label: opts.undo.label, onClick: () => opts.undo!.run(id) },
          });
        } else {
          toastSuccess(opts.successMessage ?? "已删除");
        }
      } catch (err) {
        toastError(
          `${opts.errorPrefix ?? "删除失败"}：${
            err instanceof Error ? err.message : "网络错误"
          }`
        );
      } finally {
        setDeletingId(null);
      }
    },
    [opts]
  );

  return { deletingId, remove };
}
