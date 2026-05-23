import type { Metadata } from "next";
import { JetBrains_Mono, DM_Sans } from "next/font/google";
import ParticleSphere from "@/components/ParticleSphere";
import DynamicBackground from "@/components/DynamicBackground";
import "./globals.css";

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
  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <DynamicBackground />
        <ParticleSphere />
        <main className="relative z-20">{children}</main>
      </body>
    </html>
  );
}