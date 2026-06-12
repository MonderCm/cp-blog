"use client";

import { useEffect, useState } from "react";

/**
 * 三态主题切换:浅 → 深 → 跟随系统 → 循环
 *
 * 工作方式:
 * - localStorage("cp-blog-theme") 存用户选择: "light" | "dark" | "system"
 * - layout.tsx 的内联脚本在 React hydrate 前就把 html.dark 类加上,避免闪白
 * - "system" 模式监听 prefers-color-scheme,系统切换会自动跟随
 */

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "cp-blog-theme";

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  html.classList.toggle("dark", isDark);
}

const NEXT: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const LABEL: Record<ThemeMode, string> = {
  light: "切换到深色",
  dark: "跟随系统",
  system: "切换到浅色",
};

export default function ThemeToggle() {
  // 默认 "system",挂载后立即从 localStorage 同步
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
    // 一次性 hydration:把内联脚本已经应用的真实主题同步到 React state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(saved);
    setMounted(true);

    // 系统主题变化时,如果当前是 system 模式则跟着切
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const next = NEXT[mode];
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  // SSR 与首次 hydrate 时渲染占位,避免 mismatch(layout 内联脚本已经应用了真实主题)
  if (!mounted) {
    return <div className="theme-toggle" aria-hidden style={{ visibility: "hidden" }} />;
  }

  return (
    <button
      onClick={cycle}
      className="theme-toggle"
      title={LABEL[mode]}
      aria-label={LABEL[mode]}
    >
      {mode === "light" && <SunIcon />}
      {mode === "dark" && <MoonIcon />}
      {mode === "system" && <SystemIcon />}
    </button>
  );
}

/* ========== 图标 ========== */

function SunIcon() {
  // 圆 + 八道光线
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  );
}

function MoonIcon() {
  // 月牙(crescent)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon() {
  // 圆里同时画一半太阳一半月亮,提示"跟随"
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 a9 9 0 0 1 0 18 z" fill="currentColor" stroke="none" />
    </svg>
  );
}
