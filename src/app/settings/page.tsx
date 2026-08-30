"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { loadCustomBannedWords, saveCustomBannedWords, DEFAULT_BANNED_WORDS } from "@/lib/banned-words";
import { useShortcutHelp } from "@/components/ShortcutProvider";

interface ProviderDef {
  key: string;
  name: string;
  defaultModel: string;
  desc: string;
  defaultBaseUrl?: string;
}

const PROVIDERS: ProviderDef[] = [
  { key: "siliconflow", name: "硅基流动 (SiliconFlow)", defaultModel: "deepseek-ai/DeepSeek-V4-Flash", desc: "国产，便宜，DeepSeek V4 全系" },
  { key: "deepseek", name: "DeepSeek 官方", defaultModel: "deepseek-v4-flash", desc: "DeepSeek 官方 API，兼容 OpenAI 格式" },
  { key: "openai", name: "OpenAI", defaultModel: "gpt-4o", desc: "GPT-4o / GPT-4.1 系列" },
  { key: "groq", name: "Groq", defaultModel: "llama-3.3-70b-versatile", desc: "极速推理，开源模型" },
  { key: "local", name: "本地推理 (Ollama)", defaultModel: "", desc: "本机 GPU 跑模型，零 API 费用，需先装 Ollama", defaultBaseUrl: "http://localhost:11434/v1" },
  { key: "custom", name: "自定义 (OpenAI 兼容)", defaultModel: "", desc: "任何兼容 OpenAI API 的服务" },
];

function SectionHeader({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="settings-badge"><Icon name={icon} size={15} /></span>
      <label className="text-sm font-semibold text-[var(--nv-text-secondary)]">{children}</label>
    </div>
  );
}

export default function SettingsPage() {
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentOperate, setAgentOperate] = useState(() => {
    try { return localStorage.getItem("nf-agent-mode") !== "readonly"; } catch { return true; }
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  // FE-N7 违禁词自定义词库
  const [bannedWords, setBannedWords] = useState("");
  const [bannedSaved, setBannedSaved] = useState(false);
  const { openHelp: openShortcutHelp, list: listShortcuts } = useShortcutHelp();

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    try {
      setBannedWords(loadCustomBannedWords().join("\n"));
    } catch {
      /* ignore */
    }
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const s = await res.json();
        setProvider(s.llmProvider || "siliconflow");
        setModel(s.llmModel || "");
        setBaseUrl(s.llmBaseUrl || "");
        setHasExistingKey(!!s.hasKey);
        if (s.hasKey) setApiKey("");
        // 已有配置时自动检索一次模型列表（后端用库中 Key）
        if (s.hasKey) fetchModels({ provider: s.llmProvider, baseUrl: s.llmBaseUrl });
      } else {
        setStatusMsg("加载设置失败（HTTP " + res.status + "）");
        setStatusType("error");
      }
    } catch (err) {
      setStatusMsg("加载设置失败：" + (err instanceof Error ? err.message : "请重试"));
      setStatusType("error");
    }
  }

  async function fetchModels(opts?: { provider?: string; apiKey?: string; baseUrl?: string }) {
    const p = opts?.provider ?? provider;
    const k = opts?.apiKey ?? apiKey.trim();
    const b = opts?.baseUrl ?? baseUrl;
    if (!k && !hasExistingKey) {
      setModelsError("请先填入 API Key 再检索模型");
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p, apiKey: k || undefined, baseUrl: b || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setModels(data.models || []);
        if (!data.models || data.models.length === 0) {
          setModelsError("未检索到模型，可直接手动输入模型 ID");
        }
      } else {
        setModelsError(data.error || "检索失败");
      }
    } catch (e) {
      setModelsError(String(e));
    } finally {
      setModelsLoading(false);
    }
  }

  function handleProviderChange(key: string) {
    setProvider(key);
    const def = PROVIDERS.find((p) => p.key === key);
    if (def?.defaultModel && !model) setModel(def.defaultModel);
    // 预设 provider（非 custom/local）不显示 Base URL 框，强制使用代码默认值：
    // 切换时清空残留 baseUrl，避免从 custom 模式残留的错误 URL 被保存进库污染预设 provider。
    if (key === "custom" || key === "local") {
      if (def?.defaultBaseUrl && !baseUrl) setBaseUrl(def.defaultBaseUrl);
    } else {
      setBaseUrl("");
    }
    setTestResult(null);
    if (key !== "local" && (apiKey.trim() || hasExistingKey)) fetchModels({ provider: key });
  }

  async function handleTest(keyArg?: string) {
    const key = (keyArg ?? apiKey).trim();
    if (provider !== "local" && !key && !hasExistingKey) {
      setTestResult({ ok: false, error: "请先填入 API Key" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: key || undefined,
          baseUrl: baseUrl || undefined,
          model: model || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const key = apiKey.trim();
    // v3.1.54 P0 修复：原判断漏了 `&& !hasExistingKey`，与 UI「已保存 · 留空则不修改」
    // 的承诺（见 L309 / L321 占位符）直接矛盾——已配置过 Key 的用户出于安全不回显，
    // 输入框天然为空，于是想单独改「模型 / Base URL」都会被这里拦下，
    // 必须把整串 Key 重新粘一遍才能保存。本文件其余 4 处（L97/142/337/396）
    // 均已正确带上 hasExistingKey 兜底，此处属疏漏。
    if (provider !== "local" && !key && !hasExistingKey) {
      setStatusMsg("请填入 API Key");
      setStatusType("error");
      return;
    }
    setSaving(true);
    setStatusMsg("");
    setStatusType(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: provider,
          // 留空一律传 undefined（而非空串），否则会把库里已存的 Key 覆盖成空 —— 违背「留空则不修改」
          llmApiKey: key || undefined,
          llmModel: model || undefined,
          llmBaseUrl: baseUrl || undefined,
        }),
      });
      if (res.ok) {
        setStatusMsg("设置已保存");
        setStatusType("success");
        // 留空保存（只改模型/BaseURL）时 key 为空，不能因此把「已保存」标记清掉，
        // 否则界面会倒退成「未配置 Key」，测试连接/模型检索按钮随之被禁用。
        setHasExistingKey((prev) => !!key || prev);
        setApiKey("");
        // 保存后自动连接验证
        await handleTest(key);
        // 用刚保存的 Key 刷新模型列表（本地推理跳过检索）
        if (provider !== "local") fetchModels({ provider, apiKey: key });
      } else {
        const d = await res.json().catch(() => ({}));
        setStatusMsg(`保存失败：${d.error || "未知错误"}`);
        setStatusType("error");
      }
    } catch {
      setStatusMsg("网络错误，保存失败");
      setStatusType("error");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveBannedWords() {
    try {
      const arr = bannedWords
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean);
      saveCustomBannedWords(arr);
      setBannedSaved(true);
      setTimeout(() => setBannedSaved(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.key === provider);

  return (
    <main className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)]">
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] text-sm transition-colors">
              ← 返回
            </Link>
            <div className="flex items-center gap-2.5">
              <Icon name="settings" size={20} className="text-[var(--nv-text-secondary)]" />
              <h1 className="text-base font-bold text-[var(--nv-text-primary)]">设置</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-2">
        {/* 说明 */}
        <div className="p-4 rounded-2xl surface-elevated">
          <p className="text-sm text-[var(--nv-text-tertiary)] leading-relaxed">
            Novel Forge 不自带任何 API Key。填入你自己的 Key，选择模型，所有 AI 写作功能即可使用。
            <br />
            <span className="text-[var(--nv-text-muted)] text-xs">
              Key 保存在本地数据库，不会上传到任何第三方。切换提供商后会自动检索该服务商的可用模型。
            </span>
          </p>
        </div>

        {/* 外观 / 主题 */}
        <section>
          <SectionHeader icon="palette">
            0. 外观
          </SectionHeader>
          <div className="flex items-center justify-between p-4 rounded-2xl surface-elevated">
            <div>
              <p className="text-sm text-[var(--nv-text-primary)] font-medium">界面风格</p>
              <p className="text-xs text-[var(--nv-text-muted)] mt-1">
                三档主题：夜航（暗色·默认）/ 白昼（浅色）/ 苍青（青绿深色）。偏好保存在本机，刷新后保持。
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        {/* 提供商选择 */}
        <section>
          <SectionHeader icon="cloud">
            1. 选择 LLM 提供商
          </SectionHeader>
          <div className="space-y-2">
            {PROVIDERS.map((p) => {
              const active = provider === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => handleProviderChange(p.key)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
                    active
                      ? "bg-[var(--nv-primary)]/[0.08] border-[var(--nv-primary)]/30 shadow-[0_0_16px_rgba(99,102,241,0.1)]"
                      : "bg-[var(--nv-surface-2)] border-[var(--nv-border-2)] hover:border-[var(--nv-border-2)] hover:bg-[var(--nv-surface-2)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--nv-primary)] shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
                    )}
                    <span className={`font-medium text-sm ${active ? "text-[var(--nv-text-primary)]" : "text-[var(--nv-text-tertiary)]"}`}>
                      {p.name}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--nv-text-muted)] mt-1 ml-3.5">{p.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* API Key */}
        <section>
          <SectionHeader icon="key">
            2. API Key
            {hasExistingKey && (
              <span className="text-xs text-success/80 ml-2 font-normal">（已保存 <Icon name="check" size={15} className="inline-block align-text-bottom shrink-0" /> 留空则不修改）</span>
            )}
          </SectionHeader>
          {provider === "local" && (
            <p className="text-xs text-[var(--nv-text-muted)] -mt-1 mb-3">本地推理无需 API Key，填好上方 Ollama Base URL 与模型名即可。</p>
          )}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? "text" : "password"}
                className="input-glass w-full rounded-xl px-4 py-3 text-sm font-mono pr-10"
                placeholder={hasExistingKey ? "••••••••（留空保持不变）" : "sk-..."}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)] transition-colors"
              >
                <Icon name={showKey ? "eyeOff" : "eye"} size={15} />
              </button>
            </div>
            <button
              onClick={() => handleTest()}
              disabled={testing || (provider !== "local" && !apiKey.trim() && !hasExistingKey)}
              className="btn-ghost px-5 py-3 rounded-xl text-sm font-medium shrink-0 disabled:opacity-40"
            >
              {testing ? (
                <span className="flex items-center gap-1.5">
                  <Icon name="loader" size={14} className="animate-spin" /> 测试中...
                </span>
              ) : (
                "测试连接"
              )}
            </button>
          </div>
          {testResult && (
            <div
              className={`mt-3 text-xs px-4 py-3 rounded-xl border transition-all duration-200 ${
                testResult.ok
                  ? "bg-success/[0.06] text-success border-success/20"
                  : "bg-danger/[0.06] text-danger border-danger/20"
              }`}
            >
              {testResult.ok ? (
                <span className="flex items-center gap-1.5">
                  <Icon name="check" size={13} /> 连接成功，AI 功能可用
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Icon name="alert" size={13} /> {testResult.error}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Model（可下拉检索） */}
        <section>
          <SectionHeader icon="bot">
            3. 模型
            {models.length > 0 && (
              <span className="text-xs text-[var(--nv-text-muted)] ml-2 font-normal">
                （已检索到 {models.length} 个，可下拉选择或手动输入）
              </span>
            )}
          </SectionHeader>
          <div className="flex gap-2">
            <input
              list="model-list"
              type="text"
              className="input-glass w-full rounded-xl px-4 py-3 text-sm font-mono"
              placeholder={selectedProvider?.defaultModel || "选择或输入模型 ID"}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="model-list">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <button
              onClick={() => fetchModels()}
              disabled={modelsLoading || provider === "local" || (!apiKey.trim() && !hasExistingKey)}
              className="btn-ghost px-5 py-3 rounded-xl text-sm font-medium shrink-0 disabled:opacity-40"
            >
              {modelsLoading ? (
                <span className="flex items-center gap-1.5">
                  <Icon name="loader" size={14} className="animate-spin" /> 检索中...
                </span>
              ) : (
                "检索模型"
              )}
            </button>
          </div>
          {modelsError && <p className="text-xs text-danger mt-2">{modelsError}</p>}
          <p className="text-xs text-[var(--nv-text-muted)] mt-2">
            切换提供商或点「检索模型」会自动拉取该服务商的可用模型列表（需已填 Key）。也可直接手动输入模型 ID。
          </p>
        </section>

        {/* 自定义 / 本地 Base URL */}
        {provider === "custom" || provider === "local" ? (
          <section>
            <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">
              {provider === "local" ? "Ollama Base URL" : "API Base URL"}
            </label>
            <input
              type="text"
              className="input-glass w-full rounded-xl px-4 py-3 text-sm font-mono"
              placeholder={provider === "local" ? "http://localhost:11434/v1" : "https://your-api.com/v1"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-[var(--nv-text-muted)] mt-2">
              {provider === "local"
                ? "本机 Ollama 默认地址；确保已运行 ollama serve 且已 pull 模型。只需填到 /v1，会自动拼接 /chat/completions。"
                : "只需填到 /v1 即可，会自动拼接 /chat/completions"}
            </p>
          </section>
        ) : null}

        {/* FE-N7 违禁词预检词库 */}
        <section>
          <SectionHeader icon="shield">
            4. 违禁词预检词库
          </SectionHeader>
          <div className="p-4 rounded-2xl surface-elevated space-y-3">
            <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              导出前会自动扫描正文中的违禁词。内置 {DEFAULT_BANNED_WORDS.length} 个各平台普遍禁止的引流 / 广告 / 联系方式词，你可在此追加自己投稿平台的专有违禁词（每行一个）。扫描结果仅供参考，是否违禁由你判断，工具不自动删改。
            </p>
            <textarea
              value={bannedWords}
              onChange={(e) => setBannedWords(e.target.value)}
              placeholder={"每行一个，例如：\n微信\n加群\n代写"}
              className="input-glass w-full rounded-xl px-4 py-3 text-sm font-mono h-32 resize-none"
            />
            <div className="flex items-center gap-3">
              <button onClick={handleSaveBannedWords} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-medium">
                保存词库
              </button>
              {bannedSaved && (
                <span className="text-xs text-success flex items-center gap-1">
                  <Icon name="check" size={13} /> 已保存
                </span>
              )}
            </div>
          </div>
        </section>

        {/* FE-N5 快捷键速查 */}
        <section>
          <SectionHeader icon="zap">
            5. 键盘快捷键
          </SectionHeader>
          <div className="p-4 rounded-2xl surface-elevated space-y-3">
            <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              工作台支持全局快捷键，提升长篇写作流畅度。首次进入工作台会自动弹出速查；在输入框内打字时，非 Ctrl/⌘ 组合（如 N、[、]）不会触发，避免打断输入。
            </p>
            <ul className="space-y-1.5">
              {[
                { d: "保存当前章节", c: "Ctrl / ⌘ + S" },
                { d: "切换左侧栏", c: "[（左方括号）" },
                { d: "切换右侧栏", c: "]（右方括号）" },
                { d: "新建章节", c: "N" },
                { d: "命令面板", c: "Ctrl / ⌘ + K" },
              ].map((s) => (
                <li key={s.c} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--nv-surface-1)] px-3 py-2">
                  <span className="text-xs text-[var(--nv-text-secondary)]">{s.d}</span>
                  <kbd className="shrink-0 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--nv-text-primary)]">
                    {s.c}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 记忆衰减说明（v0.46.58） */}
        <section>
          <SectionHeader icon="history">
            6. 记忆衰减
          </SectionHeader>
          <div className="p-4 rounded-2xl surface-elevated space-y-3">
            <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              记忆衰减模拟人类的自然遗忘曲线：越久远的章节记忆越模糊，系统按重要度自动降级或清理，防止旧设定无限堆积挤占上下文。
            </p>
            <ul className="space-y-1">
              {[
                { t: "S 级 · 核心记忆", d: "永久保留，不衰减", tier: "s" },
                { t: "A 级 · 重要", d: "超过 30 章降级为 B", tier: "a" },
                { t: "B 级 · 一般", d: "超过 15 章降级为 C", tier: "b" },
                { t: "C 级 · 琐碎", d: "超过 5 章直接删除", tier: "c" },
              ].map((r) => (
                <li key={r.t} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--nv-surface-1)] px-3 py-2">
                  <span className={`mem-tier mem-tier-${r.tier}`}>{r.t}</span>
                  <span className="text-[11px] text-[var(--nv-text-muted)]">{r.d}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              <span className="text-accent-label">执行方式：</span>
              部署到 Vercel 等平台时由定时任务（cron）自动触发；本地运行时为<b>手动</b>——写作页底部「记忆衰减」按钮可预览受影响内容并执行清理。衰减只影响章节摘要里的重要性事件，<b>不改动正文与未收尾线索</b>。
            </p>
          </div>
        </section>

        {/* Agent 助手模式（v0.46.58） */}
        <section>
          <SectionHeader icon="sparkles">
            7. Agent 助手 · 墨灵
          </SectionHeader>
          <div className="p-4 rounded-2xl surface-elevated space-y-3">
            <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              墨灵是会使用项目工具的写作 Agent：能查询角色/词条/大纲，也能直接填写、修改、生成（如「把樊斯瑞的性格改成更外放」）。
              开启「可操作」时墨灵可修改项目数据；改为「只读」后仅查信息、不写任何数据，速度更快。
            </p>
            <button
              onClick={() => {
                const next = agentOperate ? "readonly" : "operate";
                try { localStorage.setItem("nf-agent-mode", next); } catch { /* ignore */ }
                setAgentOperate(!agentOperate);
              }}
              className={`flex items-center justify-between w-full rounded-xl border px-4 py-3 transition-colors ${
                agentOperate ? "border-[var(--nv-success)]/40 bg-[var(--nv-success)]/10" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`text-sm font-medium ${agentOperate ? "text-[var(--nv-success)]" : "text-[var(--nv-text-secondary)]"}`}>
                  {agentOperate ? "可操作模式（当前）" : "只读模式（当前）"}
                </span>
                <span className="text-[10px] text-[var(--nv-text-muted)]">
                  {agentOperate ? "墨灵可查询并修改项目数据" : "墨灵仅查信息，不改数据，响应更快"}
                </span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${agentOperate ? "bg-[var(--nv-success)]" : "bg-[var(--nv-surface-3)]"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--nv-text-primary)] transition-all ${agentOperate ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
          </div>
        </section>

        {/* 保存 */}
        <div className="flex items-center gap-4 pt-6 border-t border-[var(--nv-border-2)]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Icon name="loader" size={14} className="animate-spin" /> 保存中...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Icon name="save" size={15} /> 保存设置
              </span>
            )}
          </button>
          {statusMsg && (
            <span
              className={`text-sm transition-all duration-300 ${
                statusType === "success" ? "text-success" : "text-danger"
              }`}
            >
              {statusMsg}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
