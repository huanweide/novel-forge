"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const PROVIDERS = [
  { key: "siliconflow", name: "硅基流动 (SiliconFlow)", defaultModel: "deepseek-ai/DeepSeek-V4-Flash", desc: "国产，便宜，DeepSeek V4 全系" },
  { key: "deepseek", name: "DeepSeek 官方", defaultModel: "deepseek-v4-flash", desc: "DeepSeek 官方 API，兼容 OpenAI 格式" },
  { key: "openai", name: "OpenAI", defaultModel: "gpt-4o", desc: "GPT-4o / GPT-4.1 系列" },
  { key: "groq", name: "Groq", defaultModel: "llama-3.3-70b-versatile", desc: "极速推理，开源模型" },
  { key: "custom", name: "自定义 (OpenAI 兼容)", defaultModel: "", desc: "任何兼容 OpenAI API 的服务" },
];

export default function SettingsPage() {
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
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
      }
    } catch (err) {
      setStatusMsg("加载设置失败：" + (err instanceof Error ? err.message : "请重试"));
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
    setTestResult(null);
    if (apiKey.trim() || hasExistingKey) fetchModels({ provider: key });
  }

  async function handleTest(keyArg?: string) {
    const key = (keyArg ?? apiKey).trim();
    if (!key && !hasExistingKey) {
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
    if (!key) {
      setStatusMsg("请填入 API Key");
      return;
    }
    setSaving(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: provider,
          llmApiKey: key,
          llmModel: model || undefined,
          llmBaseUrl: baseUrl || undefined,
        }),
      });
      if (res.ok) {
        setStatusMsg("✅ 设置已保存");
        setHasExistingKey(true);
        setApiKey("");
        // 保存后自动连接验证
        await handleTest(key);
        // 用刚保存的 Key 刷新模型列表
        fetchModels({ provider, apiKey: key });
      } else {
        const d = await res.json().catch(() => ({}));
        setStatusMsg(`❌ 保存失败：${d.error || "未知错误"}`);
      }
    } catch {
      setStatusMsg("❌ 网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.key === provider);

  return (
    <main className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)]">
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-md sticky top-0 z-10">
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

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
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
          <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">
            0. 外观
          </label>
          <div className="flex items-center justify-between p-4 rounded-2xl surface-elevated">
            <div>
              <p className="text-sm text-[var(--nv-text-primary)] font-medium">主题</p>
              <p className="text-xs text-[var(--nv-text-muted)] mt-1">
                默认暗色（虚空玻璃）。偏好会保存在本机，刷新后保持。
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        {/* 提供商选择 */}
        <section>
          <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">
            1. 选择 LLM 提供商
          </label>
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
          <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">
            2. API Key
            {hasExistingKey && (
              <span className="text-xs text-success/80 ml-2 font-normal">（已保存 <Icon name="check" size={15} className="inline-block align-text-bottom shrink-0" /> 留空则不修改）</span>
            )}
          </label>
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
              disabled={testing || (!apiKey.trim() && !hasExistingKey)}
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
          <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">
            3. 模型
            {models.length > 0 && (
              <span className="text-xs text-[var(--nv-text-muted)] ml-2 font-normal">
                （已检索到 {models.length} 个，可下拉选择或手动输入）
              </span>
            )}
          </label>
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
              disabled={modelsLoading || (!apiKey.trim() && !hasExistingKey)}
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

        {/* 自定义 Base URL */}
        {provider === "custom" && (
          <section>
            <label className="text-sm font-semibold text-[var(--nv-text-secondary)] block mb-3">API Base URL</label>
            <input
              type="text"
              className="input-glass w-full rounded-xl px-4 py-3 text-sm font-mono"
              placeholder="https://your-api.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-[var(--nv-text-muted)] mt-2">只需填到 /v1 即可，会自动拼接 /chat/completions</p>
          </section>
        )}

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
                statusMsg.startsWith("✅") ? "text-success" : "text-danger"
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
