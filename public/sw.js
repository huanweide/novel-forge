// Novel Forge Service Worker — 自毁版本
// activate 后清除所有缓存并注销自身
// 之后不再拦截任何请求，相当于没有 SW

const CACHE = "novel-forge-v5-self-destruct";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
  // 自毁：注销自己
  // @ts-ignore
  self.registration.unregister().then(() => {
    // 强制刷新所有打开的页面
    self.clients.matchAll({ type: "window" }).then((clients) => {
      clients.forEach((c) => c.navigate(c.url));
    }).catch(() => {});
  }).catch(() => {});
});

// 不缓存任何请求
self.addEventListener("fetch", () => {
  // 什么都不做，让请求直接走网络
});
