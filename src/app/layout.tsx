import type { Metadata } from "next";
import { JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import BackgroundProvider from "@/components/BackgroundProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CP Blog",
  description: "Codeforces 与 AtCoder 竞赛刷题记录",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 内联脚本:在 React hydrate 前同步读 localStorage,决定是否给 <html> 加 .dark
  // 这是避免「浅色 → 深色」闪烁的标准做法(next-themes、Vercel 等都是这套)
  const noFlashScript = `
    (function() {
      try {
        var m = localStorage.getItem('cp-blog-theme') || 'system';
        var isDark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `;

  // 前进/后退回到本站时页面可能是缓存快照(bfcache 或 disk cache),React 水合会
  // 卡死导致全页按钮失灵。必须放内联脚本(React 之外)自动刷新一次,sessionStorage
  // 防死循环。pageshow 覆盖 bfcache 恢复(该场景不重新执行脚本,只触发事件)。
  const bfReloadScript = `
    (function() {
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav && nav.type === 'back_forward') {
          if (!sessionStorage.getItem('cp-bf-reload')) {
            sessionStorage.setItem('cp-bf-reload', '1');
            location.reload();
            return;
          }
        }
        sessionStorage.removeItem('cp-bf-reload');
        window.addEventListener('pageshow', function(e) {
          if (e.persisted) location.reload();
        });
      } catch (e) {}
    })();
  `;

  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <script dangerouslySetInnerHTML={{ __html: bfReloadScript }} />
      </head>
      <body className="min-h-full text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <BackgroundProvider />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}