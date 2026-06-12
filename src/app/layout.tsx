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

  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <BackgroundProvider />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}