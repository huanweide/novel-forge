"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";

type Item = {
  id: string;
  type: "node" | "character" | "lore" | "rule" | "action";
  title: string;
  subtitle?: string;
  action: () => void;
};

const TYPE_LABEL: Record<Item["type"], string> = {
  node: "章节", character: "角色", lore: "世界书", rule: "规则", action: "操作",
};
const TYPE_ICON: Record<Item["type"], string> = {
  node: "file", character: "user", lore: "book", rule: "settings", action: "sparkles",
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 焦点陷阱：打开时聚焦首个可交互元素、Tab 循环、ESC（无论焦点在哪）关闭、关闭后返还焦点
  useFocusTrap(panelRef, open, () => setOpen(false));

  // 全局快捷键 Cmd/Ctrl+K，或外部派发事件打开（顶栏按钮）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("nf-open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nf-open-command-palette", onOpen);
    };
  }, []);

  const projectId = useMemo(() => {
    const m = pathname?.match(/\/workspace\/([^/?]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  const buildActions = useCallback((): Item[] => {
    const acts: Item[] = [
      { id: "a-home", type: "action", title: "返回主页", subtitle: "项目列表", action: () => router.push("/") },
      { id: "a-settings", type: "action", title: "打开设置", action: () => router.push("/settings") },
      { id: "a-explore", type: "action", title: "探讨模式", action: () => router.push("/explore") },
      { id: "a-dissect", type: "action", title: "拆书分析", action: () => router.push("/dissect") },
      { id: "a-workshop", type: "action", title: "创意工坊", action: () => router.push("/workshop") },
      { id: "a-recycle", type: "action", title: "回收站", action: () => router.push("/recycle") },
    ];
    if (projectId) {
      acts.unshift({
        id: "a-newchapter", type: "action", title: "新建章节", subtitle: "在当前项目",
        action: () => router.push(`/workspace/${projectId}`),
      });
    }
    return acts;
  }, [projectId, router]);

  const loadProjectData = useCallback(async () => {
    if (!projectId) {
      setItems(buildActions());
      return;
    }
    setLoadingData(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const p = await res.json();
      const list: Item[] = [];
      (p.storyNodes || []).forEach((n: any) =>
        list.push({ id: `n-${n.id}`, type: "node", title: n.title, subtitle: `${n.type} · ${n.status}`, action: () => router.push(`/workspace/${projectId}?node=${n.id}`) }));
      (p.characters || []).forEach((c: any) =>
        list.push({ id: `c-${c.id}`, type: "character", title: c.name, subtitle: c.role, action: () => router.push(`/workspace/${projectId}?editCharacter=${c.id}`) }));
      (p.lorebookEntries || []).forEach((l: any) =>
        list.push({ id: `l-${l.id}`, type: "lore", title: l.title, subtitle: l.category, action: () => router.push(`/workspace/${projectId}?editLore=${l.id}`) }));
      (p.rules || []).forEach((r: any) =>
        list.push({ id: `r-${r.id}`, type: "rule", title: (r.name as string) || "规则", subtitle: "规则", action: () => router.push(`/workspace/${projectId}?tab=rules`) }));
      setItems([...list, ...buildActions()]);
    } catch {
      setItems(buildActions());
    } finally {
      setLoadingData(false);
    }
  }, [projectId, buildActions, router]);

  // 打开时聚焦 + 加载数据
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
      loadProjectData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.title || "").toLowerCase().includes(q) ||
      (it.subtitle || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[active];
      if (it) { setOpen(false); it.action(); }
    } else if (e.key === "Escape") { setOpen(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="surface-floating w-[640px] max-w-[94vw] rounded-2xl shadow-2xl overflow-hidden animate-spring"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--nv-border-2)]">
          <Icon name="search" size={16} className="text-[var(--nv-text-tertiary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={projectId ? "搜索章节、角色、世界书、规则或执行操作" : "搜索操作或页面跳转"}
            placeholder={projectId ? "搜索章节 / 角色 / 世界书 / 规则，或执行操作…" : "搜索操作 / 页面跳转…"}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-muted)]"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar py-2">
          {loadingData && filtered.length === 0 ? (
            <p className="text-xs text-[var(--nv-text-tertiary)] px-4 py-3 flex items-center gap-1.5">
              <Icon name="loader" size={12} className="animate-spin" /> 加载中…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-[var(--nv-text-tertiary)] px-4 py-3">无匹配结果</p>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => { setOpen(false); it.action(); }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${i === active ? "bg-[var(--nv-primary-soft)]" : "hover:bg-[var(--nv-surface-2)]"}`}
              >
                <Icon name={TYPE_ICON[it.type] as any} size={15} className="text-[var(--nv-text-tertiary)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--nv-text-primary)] truncate">{it.title}</div>
                  {it.subtitle && <div className="text-[10px] text-[var(--nv-text-tertiary)] truncate">{it.subtitle}</div>}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] shrink-0">
                  {TYPE_LABEL[it.type]}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
