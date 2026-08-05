import type { Metadata } from "next";
import "./globals.css";
import { SystemStatusBanner } from "@/components/system-status-banner";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutProvider } from "@/components/ShortcutProvider";

export const metadata: Metadata = {
  title: "Novel Forge — AI 小说工坊",
  description: "基于大语言模型的长篇小说智能写作系统",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Novel Forge",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#4f46e5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
/* 首屏前应用主题，避免闪烁（三档：dark 夜航 / light 白昼 / azure 苍青） */
(function(){
  try {
    var t = localStorage.getItem('nf-theme');
    var d = document.documentElement;
    d.classList.remove('light','dark','azure');
    if (t === 'light') { d.classList.add('light'); }
    else if (t === 'azure') { d.classList.add('azure'); d.classList.add('dark'); } /* 苍青=深色风格，保留 dark: 变体 */
    else { d.classList.add('dark'); }
  } catch(e){}
})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
/* 清除所有 Service Worker——Novel Forge 不需要离线缓存 */
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(function(regs){
    regs.forEach(function(r){ r.unregister(); });
  });
}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <noscript>
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#F8F7F2", background: "#0E1424", fontFamily: "system-ui, sans-serif" }}>
            本应用需要启用 JavaScript 才能运行。请在现代浏览器中开启 JavaScript 后访问 Novel Forge。
          </div>
        </noscript>
        <SystemStatusBanner />
        <ToastProvider>
          <ShortcutProvider>{children}</ShortcutProvider>
        </ToastProvider>
        <CommandPalette />
      </body>
    </html>
  );
}
