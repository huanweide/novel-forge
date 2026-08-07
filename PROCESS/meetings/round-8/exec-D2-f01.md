# exec-D2-f01 — F01 浅色主题金色小文字对比度回填

审计基线：v1.6.9（commit fc5a662）
日期：2026-08-07

## 任务
将浅色主题下 CR<4.5 的金色小号文字由 `text-[var(--nv-accent)]` 改为 `text-accent-label`
（`.light .text-accent-label` 用暗金 `--nv-accent-text-on-light: oklch(0.50 0.12 95)`，CR≥4.5）。
不改图标专用色、背景渐变、大号标题、按钮激活态。

## 已改文件:行（共 11 处 / 9 文件）

| 文件 | 行 | 改前 | 说明 |
|------|----|------|------|
| `src/app/recycle/page.tsx` | 91 | `Icon...className="text-[var(--nv-accent)]"` | 回收站图标+标题串；图标浅色用暗金无害 |
| `src/app/settings/page.tsx` | 491 | `<span className="text-[var(--nv-accent)]">执行方式：</span>` | 状态标签小字 |
| `src/app/workshop/page.tsx` | 438 | `<span className="text-[11px] text-[var(--nv-accent)]">内置</span>` | 选项名小字 |
| `src/app/page.tsx` | 320 | `<div className="text-[10px] text-[var(--nv-accent)] mt-1">创建中…</div>` | 提示语小字 |
| `src/app/workspace/[projectId]/game/[nodeId]/page.tsx` | 1071 | `<span className="text-[var(--nv-accent)]">{i.name}</span>` | 跑团货币名 |
| 同上 | 1072 | `<span className="ml-2 text-[var(--nv-accent)]">` | 跑团货币数量 |
| 同上 | 1243 | `<p className="...text-[var(--nv-accent)]">` | 导出待确认提示（含 alert 图标，整体改无害） |
| `src/components/workspace/CenterPanel.tsx` | 208 | `<Icon name="alert" ... className="text-[var(--nv-accent)]" /> 待修改` | 待修改状态图标色 |
| `src/components/workspace/CharacterList.tsx` | 513 | `<span className="text-[var(--nv-accent)]">龙套标记：</span>` | 龙套标记小字 |
| `src/components/ui/status-badge.tsx` | 25 | `pending_confirm` cls `text-[var(--nv-accent)]` | 待确认徽章文字 |
| `src/components/ui/status-badge.tsx` | 27 | `reviewing` cls `text-[var(--nv-accent)]` | 审校中徽章文字 |

## 未改 / 跳过说明
- `CenterPanel.tsx:208` 的「待修改」金色仅落在 alert **图标** className 上（文字本身无金色类），
  与“不改图标专用色”的一般约束略有冲突；因任务明确点名为必改点且浅色下暗金更达标，已按显式指令改动图标色，特此说明。
- `CenterPanel.tsx:318`「微调模式」提示本就已是 `text-accent-label`，未动（符合“不要动”要求）。
- `game/[nodeId]/page.tsx:544`「互动跑团」亦为金色小字，但未在必改清单内，按“仅改上述点”约束未纳入本次。
- 其余全仓 `text-[var(--nv-accent)]` 命中均为图标（`Icon className`）、背景（`bg-[var(--nv-accent)]/...`）、
  hover、按钮激活态或非小号强调文字，已按约束全部保留。
- 未跑 tsc/vitest（className 字符串改动不影响 TS，Chair 统一校验）。

## 结论
F01 回填完成，共改 11 处 / 9 文件。建议汇报 1 处偏差（CenterPanel:208 改动落在图标而非文字）。
