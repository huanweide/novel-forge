import { prisma } from "@/lib/prisma";

export interface RuleRecord {
  id: string;
  name: string;
  content: string;
  category: string;
  enabled: boolean;
  priority: number;
  scope: string;
}

/**
 * 获取项目中所有启用的规则，按优先级降序排列
 * @param projectId 项目ID
 * @param scope 可选，过滤特定 scope 的规则（"write_only" / "outline_only" / "review_only"），不传则返回所有
 */
export async function getActiveRules(projectId: string, scope?: string): Promise<RuleRecord[]> {
  const where: any = { projectId, enabled: true };
  if (scope) {
    // scope="all" 的规则对所有场景生效，所以用 OR
    where.OR = [{ scope: "all" }, { scope }];
  }
  return prisma.rule.findMany({
    where,
    orderBy: { priority: "desc" },
    select: {
      id: true, name: true, content: true, category: true,
      enabled: true, priority: true, scope: true,
    },
  });
}

/**
 * 将启用的规则注入到 authorNote 中——这是所有 AI 路由的统一注入点
 * 用作者指令的最高优先级语义包裹规则，确保 AI 遵守
 * @param authorNote 现有的作者指令（可能为空）
 * @param rules 从 getActiveRules 获取的规则列表
 * @returns 增强后的 authorNote，规则作为最高优先级指令块注入
 */
export function injectRules(authorNote: string, rules: RuleRecord[]): string {
  if (rules.length === 0) return authorNote;

  // 按 category 分组
  const groups: Record<string, RuleRecord[]> = {};
  for (const r of rules) {
    if (!groups[r.category]) groups[r.category] = [];
    groups[r.category].push(r);
  }

  const lines: string[] = [];
  lines.push("## ⚠️ 创作规则——铁律（必须严格遵守，优先级高于章纲和角色设定）");

  const categoryLabel: Record<string, string> = {
    writing: "写作规则", world: "世界观规则", character: "角色规则",
    style: "风格规则", custom: "自定义规则",
  };

  for (const [cat, catRules] of Object.entries(groups)) {
    lines.push(`\n### ${categoryLabel[cat] || cat}`);
    for (const r of catRules) {
      lines.push(`- 【${r.name}】${r.content}`);
    }
  }

  const ruleBlock = lines.join("\n");
  if (!authorNote.trim()) return ruleBlock;
  // 规则在前，作者指令在后（两者都是最高优先级，但规则是结构性约束，作者指令是情境性指令）
  return `${ruleBlock}\n\n---\n\n## 📝 作者指令\n${authorNote}`;
}
