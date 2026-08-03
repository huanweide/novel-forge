// 真实端到端验证：一键填表（babyloreFillAll）+ 自检。
// 通过 undici ProxyAgent 走沙箱出网代理，调用真实 DeepSeek 抽取章节事实写入结构化表格。
import "dotenv/config";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxy = process.env.LLM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
  console.log("[validate] global dispatcher ->", proxy);
} else {
  console.log("[validate] 未设置 LLM_PROXY，直接出网（沙箱外可用）");
}

const PROJECT_ID = "577ed326-b241-4f67-9481-c9332cb03626";

async function main() {
  const { babyloreFillAll, selfCheckFill } = await import("@/core/babylore/fill");

  console.log("=== 一键填表 babyloreFillAll ===");
  const r = await babyloreFillAll(PROJECT_ID);
  console.log(JSON.stringify(
    {
      ok: r.ok,
      processed: r.processed,
      skipped: r.skipped,
      operations: r.operations,
      applied: r.applied,
      error: r.error,
      warnings: r.warnings,
      selfCheck: {
        checkedTables: r.selfCheck.checkedTables,
        nameIssues: r.selfCheck.nameIssues,
        completenessIssues: r.selfCheck.completenessIssues,
        issueCount: r.selfCheck.issues.length,
        issues: r.selfCheck.issues.slice(0, 30),
      },
    },
    null,
    2,
  ));

  console.log("\n=== 单独再跑一次 selfCheckFill（应 0 错误地名，因名称均来自正文）===");
  const sc = await selfCheckFill(PROJECT_ID);
  console.log(JSON.stringify(
    { checkedTables: sc.checkedTables, nameIssues: sc.nameIssues, completenessIssues: sc.completenessIssues, issues: sc.issues.slice(0, 30) },
    null,
    2,
  ));
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL", e); process.exit(1); });
