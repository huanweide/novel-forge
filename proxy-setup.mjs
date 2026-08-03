// 可选的 LLM 出网代理引导（默认关闭，零副作用）。
// 仅当设置 LLM_PROXY / HTTPS_PROXY / HTTP_PROXY 时才生效；
// 用户本地直连外网时无需任何配置，行为完全不变。
// 用法：NODE_OPTIONS="--import ./proxy-setup.mjs" LLM_PROXY=http://127.0.0.1:7897 npm run dev
//
// 动态 import 使本文件在「未安装 undici」时也安全降级（仅警告，不影响启动）。
const proxy =
  process.env.LLM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`[proxy-setup] LLM 出网代理已启用 -> ${proxy}`);
  } catch (e) {
    console.warn(
      "[proxy-setup] 未能启用代理（undici 未安装或初始化失败，忽略，直连）：",
      e?.message,
    );
  }
}
