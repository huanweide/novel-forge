/**
 * Novel Forge 图标注册表 — 虚空玻璃设计体系
 *
 * 统一管理所有 Lucide 图标映射，替代 emoji 图标。
 * 用法：<Icon name="target" size={18} />
 *
 * ⚠️ 规则：UI 图标必须来自此组件，禁止直接用 emoji
 */

import React from "react";
import {
  // 导航/结构
  Target,
  BookOpen,
  Settings,
  ClipboardList,
  Search,
  // 操作/反馈
  Sparkles,
  Wrench,
  Pencil,
  Palette,
  LayoutGrid,
  MessageSquare,
  Package,
  Bot,
  Shield,
  Save,
  Loader2,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  // 数据/文件
  FileText,
  BookMarked,
  BarChart3,
  Upload,
  Download,
  // 人物/实体
  User,
  Users,
  Skull,
  Map,
  Globe,
  Gem,
  Building2,
  ScrollText,
  Tag,
  Calendar,
  Pin,
  // 交互
  Eye,
  EyeOff,
  Lightbulb,
  Gamepad2,
  Hourglass,
  Inbox,
  // 状态
  Circle,
} from "lucide-react";

/** 图标名称 → React 组件映射 */
const iconMap = {
  target: Target,
  book: BookOpen,
  settings: Settings,
  clipboard: ClipboardList,
  search: Search,
  sparkles: Sparkles,
  wrench: Wrench,
  pencil: Pencil,
  palette: Palette,
  grid: LayoutGrid,
  message: MessageSquare,
  package: Package,
  bot: Bot,
  shield: Shield,
  save: Save,
  loader: Loader2,
  plus: Plus,
  x: X,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  check: CheckCircle2,
  alert: AlertTriangle,
  file: FileText,
  bookmarked: BookMarked,
  chart: BarChart3,
  upload: Upload,
  download: Download,
  user: User,
  users: Users,
  skull: Skull,
  map: Map,
  globe: Globe,
  gem: Gem,
  building: Building2,
  scroll: ScrollText,
  tag: Tag,
  calendar: Calendar,
  pin: Pin,
  eye: Eye,
  eyeOff: EyeOff,
  lightbulb: Lightbulb,
  gamepad: Gamepad2,
  hourglass: Hourglass,
  inbox: Inbox,
  circle: Circle,
} as const;

export type IconName = keyof typeof iconMap;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Novel Forge 统一图标组件 */
export function Icon({ name, size = 18, className = "", strokeWidth = 1.8 }: IconProps) {
  const LucideIcon = iconMap[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
}

/**
 * 语义色彩预设 — 用于快速给图标上色
 */
export const iconColor = {
  primary:  "text-indigo-400",
  success:  "text-emerald-400",
  warning:  "text-amber-400",
  danger:   "text-rose-400",
  creative: "text-violet-400",
  info:     "text-sky-400",
  accent:   "text-yellow-400",
  muted:    "text-zinc-500",
} as const;

/**
 * 彩色圆点组件 — 替代 🟢🟡🔵🔴
 */
export function StatusDot({ color, size = 8 }: { color: "green" | "yellow" | "blue" | "red" | "gray"; size?: number }) {
  const colorMap = {
    green:  "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]",
    yellow: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]",
    blue:   "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)]",
    red:    "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.4)]",
    gray:   "bg-zinc-500 shadow-[0_0_6px_rgba(113,113,122,0.3)]",
  };
  return <span className={`inline-block rounded-full ${colorMap[color]}`} style={{ width: size, height: size }} />;
}
