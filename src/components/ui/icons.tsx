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
  ArrowDown,
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
  GitBranch,
  Pause,
  Play,
  Moon,
  Backpack,
  Sword,
  Square,
  Trash2,
  Star,
  MapPin,
  Share2,
  Zap,
  RefreshCw,
  Info,
  Cloud,
  Sun,
  // 状态
  Circle,
  // 语义扩展（FE-2：替代 UI 装饰 emoji）
  Brain,
  Mountain,
  MessageCircle,
  Smile,
  Heart,
  Scale,
  Coffee,
  Compass,
  Hand,
  Link,
  FlaskConical,
  Radio,
  Coins,
  Clapperboard,
  Swords,
  Flower,
  Rocket,
  Drama,
  SlidersHorizontal,
  Ruler,
  KeyRound,
  Ban,
  PartyPopper,
  Landmark,
  Paperclip,
  History,
  ChevronDown,
  ChevronRight,
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
  arrowDown: ArrowDown,
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
  gitBranch: GitBranch,
  pause: Pause,
  play: Play,
  moon: Moon,
  backpack: Backpack,
  sword: Sword,
  stop: Square,
  trash: Trash2,
  star: Star,
  mapPin: MapPin,
  share: Share2,
  zap: Zap,
  refresh: RefreshCw,
  info: Info,
  cloud: Cloud,
  sun: Sun,
  circle: Circle,
  // 语义扩展（FE-2：替代 UI 装饰 emoji）
  brain: Brain,
  mountain: Mountain,
  messageCircle: MessageCircle,
  smile: Smile,
  heart: Heart,
  scale: Scale,
  coffee: Coffee,
  compass: Compass,
  hand: Hand,
  link: Link,
  flask: FlaskConical,
  radio: Radio,
  coins: Coins,
  clapperboard: Clapperboard,
  swords: Swords,
  flower: Flower,
  rocket: Rocket,
  drama: Drama,
  sliders: SlidersHorizontal,
  ruler: Ruler,
  key: KeyRound,
  ban: Ban,
  party: PartyPopper,
  landmark: Landmark,
  paperclip: Paperclip,
  square: Square,
  history: History,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
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
  primary:  "text-[var(--nv-primary)]",
  success:  "text-success",
  warning:  "text-warning",
  danger:   "text-danger",
  creative: "text-[var(--nv-creative)]",
  info:     "text-info",
  accent:   "text-[var(--nv-accent)]",
  muted:    "text-[var(--nv-text-muted)]",
} as const;

/**
 * 彩色圆点组件 — 替代 🟢🟡🔵🔴
 */
export function StatusDot({ color, size = 8 }: { color: "green" | "yellow" | "blue" | "red" | "gray"; size?: number }) {
  const colorMap = {
    green:  "bg-success shadow-[0_0_6px_var(--nv-success-soft)]",
    yellow: "bg-warning shadow-[0_0_6px_var(--nv-warning-soft)]",
    blue:   "bg-info shadow-[0_0_6px_var(--nv-info-soft)]",
    red:    "bg-danger shadow-[0_0_6px_var(--nv-danger-soft)]",
    gray:   "bg-[var(--nv-surface-1)] shadow-[0_0_6px_rgba(113,113,122,0.3)]",
  };
  return <span className={`inline-block rounded-full ${colorMap[color]}`} style={{ width: size, height: size }} />;
}
