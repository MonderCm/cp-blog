"use client";

import ThemeToggle from "@/components/ThemeToggle";

export type Section = "home" | "submissions" | "contests";

interface Props {
  name: string;

  cfHandle: string;
  atcHandle: string;
  ncHandle: string;
  onEnterSection: (s: Section) => void;
  onOpenSettings: () => void;
}

/**
 * 进站首屏(明日方舟主界面式):只有人物与功能入口,不展示任何数据。
 * 左侧人物桌宠面板,右侧斜切功能宫格,点击宫格跳转到对应数据页。
 * 人物面板是未来立绘/Live2D 的占位——替换 PetPanel 内部渲染即可,交互框架保留。
 */
export default function HomeHero({
  name, cfHandle, atcHandle, ncHandle,
  onEnterSection, onOpenSettings,
}: Props) {
  return (
    <div className="relative w-full select-none">
      <div className="max-w-6xl mx-auto px-6 pt-5 pb-4">
        {/* 顶栏:齿轮+用户名(点击改资料)| 三平台直达 | 主题切换 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="group flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors hover:text-foreground"
              style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}
              title="修改个人信息"
            >
              <GearIcon className="w-4 h-4 text-foreground/50 group-hover:text-foreground/90 group-hover:rotate-45 transition-all duration-300" />
              <span>{name}</span>
            </button>
            <QuickLink label="CF" href={cfHandle ? `https://codeforces.com/profile/${cfHandle}` : undefined} />
            <QuickLink label="AC" href={atcHandle ? `https://atcoder.jp/users/${atcHandle}` : undefined} />
            <QuickLink label="NC" href={ncHandle ? `https://ac.nowcoder.com/acm/contest/profile/${ncHandle}/` : undefined} />
          </div>
          <ThemeToggle />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 items-stretch">
          {/* ---- 左:待规划功能区(原角色面板已移除,人物改为全局桌宠) ---- */}
          <div
            className="w-full aspect-[4/5] max-h-[440px] rounded-2xl border border-dashed flex items-center justify-center text-xs text-muted-foreground/60"
            style={{ borderColor: "var(--surface-border)" }}
          >
            待规划区域
          </div>

          {/* ---- 右:斜切功能宫格,与左侧等高、垂直均分 ---- */}
          <div className="flex flex-col gap-3 max-h-[440px]">
            <div
              className="hero-tile flex items-center px-6 py-3"
              style={{ clipPath: "polygon(2.5% 0, 100% 0, 97.5% 100%, 0 100%)", background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}
            >
              <span className="text-[10px] tracking-[0.15em] mr-3" style={{ color: "var(--accent-text)" }}>NOTICE</span>
              <span className="text-sm text-foreground/80 truncate">欢迎来到 {name} 的刷题主页</span>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3">
              <NavTile en="HOME" zh="首页" desc="Rating / 热力图 / 统计" onClick={() => onEnterSection("home")} />
              <NavTile en="CONTESTS" zh="比赛" desc="三平台近期赛程" onClick={() => onEnterSection("contests")} />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <NavTile en="LOG" zh="学习记录" desc="每日提交明细" onClick={() => onEnterSection("submissions")} />
              <NavTile en="STEAM" zh="敬请期待" desc="尚未接入" disabled />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.1 3.6V3.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.28Z" />
    </svg>
  );
}

function QuickLink({ label, href }: { label: string; href?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold text-foreground/70 hover:text-foreground transition-colors"
      style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}
      title={`${label} 主页`}
    >
      {label}
    </a>
  );
}

function NavTile({ en, zh, desc, disabled, onClick }: {
  en: string; zh: string; desc?: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hero-tile group relative h-full min-h-[110px] px-6 py-5 text-right transition-all duration-200 flex flex-col justify-end items-end"
      style={{
        clipPath: "polygon(7% 0, 100% 0, 100% 100%, 0% 100%)",
        background: "var(--surface-bg)",
        border: "1px solid var(--surface-border)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {/* 右上角强调角标 */}
      <span
        className="absolute top-0 right-0 w-10 h-[3px] transition-all duration-300 group-hover:w-16"
        style={{ background: disabled ? "var(--surface-border)" : "var(--accent)" }}
      />
      <span className="block text-[10px] tracking-[0.2em] text-muted-foreground group-hover:text-foreground/60 transition-colors">{en}</span>
      <span className="block text-lg font-bold text-foreground mt-0.5">{zh}</span>
      {desc && <span className="block text-[10px] mt-1 text-muted-foreground/70">{desc}</span>}
    </button>
  );
}
