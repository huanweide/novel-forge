"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PROVIDERS = [
  { key: "siliconflow", name: "硅基流动 (SiliconFlow)", defaultModel: "deepseek-ai/DeepSeek-V4-Flash", desc: "国产，便宜，DeepSeek V4 全系" },
  { key: "deepseek", name: "DeepSeek 官方", defaultModel: "deepseek-chat", desc: "DeepSeek 官方 API，兼容 OpenAI 格式" },
  { key: "openai", name: "OpenAI", defaultModel: "gpt-4o", desc: "GPT-4o / GPT-4.1 系列" },
  { key: "groq", name: "Groq", defaultModel: "llama-3.3-70b-versatile", desc: "极速推理，开源模型" },
  { key: "custom", name: "自定义 (OpenAI 兼容)", defaultModel: "", desc: "任何兼容 OpenAI API 的服务" },
];

export default function SettingsPage() {
  const [provider, setProvider] = useState("siliconflow");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

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
        if (s.hasKey) {
          // 已有 Key：显示掩码，让用户知道之前配过
          setApiKey("");
        }
      }
    } catch { /* */ }
  }

  function handleProviderChange(key: string) {
    setProvider(key);
    const def = PROVIDERS.find(p => p.key === key);
    if (def?.defaultModel && !model) setModel(def.defaultModel);
    setTestResult(null);
  }

  async function handleTest() {
    const key = apiKey.trim();
    if (!key) {
      setTestResult({ ok: false, error: "请先填入 API Key" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key, baseUrl: baseUrl || undefined, model: model || undefined }),
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
        setStatusMsg("✅ 设置已保存，所有 AI 功能即刻生效");
        setHasExistingKey(true);
        setApiKey(""); // 清空输入
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

  const selectedProvider = PROVIDERS.find(p => p.key === provider);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">← 返回</Link>
          <h1 className="text-lg font-semibold">⚙️ 设置</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* 说明 */}
        <div className="text-sm text-zinc-500 leading-relaxed">
          Novel Forge 不自带任何 API Key。填入你自己的 Key，选择模型，所有 AI 写作功能即可使用。
          <br />
          Key 保存在本地数据库，不会上传到任何第三方。
        </div>

        {/* 提供商选择 */}
        <section>
          <label className="text-sm font-medium text-zinc-300 block mb-2">LLM 提供商</label>
          <div className="space-y-1.5">
            {PROVIDERS.map(p => (
              <button key={p.key}
                onClick={() => handleProviderChange(p.key)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm ${
                  provider === p.key
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700"
                }`}>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-600 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section>
          <label className="text-sm font-medium text-zinc-300 block mb-2">
            API Key
            {hasExistingKey && <span className="text-xs text-zinc-600 ml-2">（已有配置，留空则不修改）</span>}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? "text" : "password"}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 pr-10"
                placeholder={hasExistingKey ? "••••••••（留空保持不变）" : "sk-..."}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
              />
              <button onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-600 hover:text-zinc-400">
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
            <button onClick={handleTest} disabled={testing || !apiKey.trim()}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 shrink-0">
              {testing ? "测试中..." : "测试连接"}
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${
              testResult.ok ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}>
              {testResult.ok ? "✅ 连接成功" : `❌ ${testResult.error}`}
            </div>
          )}
        </section>

        {/* Model */}
        <section>
          <label className="text-sm font-medium text-zinc-300 block mb-2">模型名称</label>
          <input
            type="text"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500"
            placeholder={selectedProvider?.defaultModel || "输入模型 ID"}
            value={model}
            onChange={e => setModel(e.target.value)}
          />
          <p className="text-xs text-zinc-600 mt-1">
            切换提供商会自动填入推荐模型。你也可以手动改。
          </p>
        </section>

        {/* 自定义 Base URL（仅 custom 提供商） */}
        {provider === "custom" && (
          <section>
            <label className="text-sm font-medium text-zinc-300 block mb-2">API Base URL</label>
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500"
              placeholder="https://your-api.com/v1"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-zinc-600 mt-1">
              只需填到 /v1 即可，会自动拼接 /chat/completions
            </p>
          </section>
        )}

        {/* 保存 */}
        <div className="flex items-center gap-4 pt-4 border-t border-zinc-800">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? "保存中..." : "💾 保存设置"}
          </button>
          {statusMsg && (
            <span className={`text-sm ${statusMsg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
              {statusMsg}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
