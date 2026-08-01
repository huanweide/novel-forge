import { useCallback, useRef, useState } from "react";

export interface VirtualRow<T> {
  item: T;
  index: number;
  offsetTop: number;
}

export interface UseVirtualRowsOptions {
  /** 单行固定高度（px）——表格行必须等高才能用本 hook */
  rowHeight: number;
  /** 超过此行数才启用虚拟滚动，否则普通渲染（小列表零开销） */
  threshold?: number;
  /** 视口上下额外预渲染的行数，避免快速滚动露白 */
  overscan?: number;
  /** 滚动视口高度（px），决定一次性渲染多少行 */
  viewportHeight?: number;
}

/**
 * 零依赖轻量虚拟列表 hook。
 * 原理类比：书架很高（几千本书），你只把「眼睛正对着的那一屏 + 上下各多摆几本」放上架子，
 * 其余书留在仓库（用撑高的占位把滚动条长度凑齐）。滚到哪算到哪，永远只渲染看得见的一小段。
 */
export function useVirtualRows<T>(items: T[], opts: UseVirtualRowsOptions) {
  const { rowHeight, threshold = 50, overscan = 10, viewportHeight = 360 } = opts;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const enabled = items.length > threshold;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  // 撑出整张表的滚动高度，让滚动条比例正确
  const totalHeight = enabled ? items.length * rowHeight : 0;

  let startIndex = 0;
  let endIndex = items.length;
  if (enabled) {
    startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    endIndex = Math.min(items.length, startIndex + visible);
  }

  const virtualItems: VirtualRow<T>[] = items
    .slice(startIndex, endIndex)
    .map((item, i) => ({
      item,
      index: startIndex + i,
      offsetTop: (startIndex + i) * rowHeight,
    }));

  return { scrollRef, onScroll, enabled, totalHeight, virtualItems, startIndex, endIndex };
}
