"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export interface HeatmapProblem {
  id: string;
  name: string;
  url: string;
  score?: number;
}

interface HeatmapProps {
  submissions: Record<string, HeatmapProblem[]>;
}

/* CF-style GitHub green palette */
const COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

function getColor(count: number): string {
  if (count === 0) return COLORS[0];
  if (count <= 2) return COLORS[1];
  if (count <= 4) return COLORS[2];
  if (count <= 8) return COLORS[3];
  return COLORS[4];
}

const DAY_LABELS = ["", "一", "", "三", "", "五", ""];
const WEEK_DAYS_FULL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const GAP = 2;
const DAY_COL_W = 24; // day label column width
const TOOLTIP_MAX_W = 420; // tooltip 宽度自适应内容,超过此宽度题名截断
const PAD = 12; // container p-3 padding

/* ---- helpers ---- */

/** 判断某年是否为闰年 */
function isLeapYear(y: number) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

/** 从 submissions 键中提取所有年份 */
function getAvailableYears(data: Record<string, HeatmapProblem[]>, currentYear: number): number[] {
  const years = new Set<number>();
  for (const k of Object.keys(data)) {
    const y = parseInt(k.slice(0, 4), 10);
    if (!isNaN(y)) years.add(y);
  }
  years.add(currentYear);
  return Array.from(years).sort((a, b) => b - a);
}

/* ---- component ---- */

export default function Heatmap({ submissions }: HeatmapProps) {
  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => getAvailableYears(submissions, currentYear), [submissions, currentYear]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(13);

  /* ---- responsive cell size (computed after grid) ---- */

  /* ---- date range ---- */
  const { start, end } = useMemo(() => {
    if (selectedYear) {
      return {
        start: `${selectedYear}-01-01`,
        end: `${selectedYear}-12-31`,
      };
    }
    // rolling 365/366 days
    const now = new Date();
    const daysBack = isLeapYear(now.getFullYear()) ||
                     (now.getMonth() > 1 || (now.getMonth() === 1 && now.getDate() >= 29))
      ? 366 : 365;
    const s = new Date(now);
    s.setDate(s.getDate() - daysBack + 1);
    return {
      start: s.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    };
  }, [selectedYear]);

  /* ---- build grid ---- */
  const { weeks, months, totalCount, totalProblems, maxStreak, bestDay } = useMemo(() => {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");

    // align to Sunday
    const iter = new Date(s);
    while (iter.getDay() !== 0) iter.setDate(iter.getDate() - 1);

    const w: { date: string; count: number; problems: HeatmapProblem[] }[][] = [];
    let cw: { date: string; count: number; problems: HeatmapProblem[] }[] = [];
    const mPos: { label: string; col: number }[] = [];
    let lastMonth = -1;
    let ci = 0;

    while (iter <= e) {
      const d = iter.toISOString().slice(0, 10);
      const probs = submissions[d] || [];
      const cnt = probs.length;
      const month = iter.getMonth();
      if (month !== lastMonth) {
        mPos.push({ label: MONTHS[month], col: ci });
        lastMonth = month;
      }
      cw.push({ date: d, count: cnt, problems: probs });
      if (iter.getDay() === 6) { w.push(cw); cw = []; ci++; }
      iter.setDate(iter.getDate() + 1);
    }
    if (cw.length > 0) w.push(cw);

    let tc = 0, tp = 0, streak = 0, ms = 0, bd = 0;
    for (const wk of w) for (const cell of wk) {
      if (cell.count > 0) {
        tc++; tp += cell.count;
        streak++;
        if (streak > ms) ms = streak;
        if (cell.count > bd) bd = cell.count;
      } else {
        streak = 0;
      }
    }
    return { weeks: w, months: mPos, totalCount: tc, totalProblems: tp, maxStreak: ms, bestDay: bd };
  }, [submissions, start, end]);

  /* ---- responsive cell size ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      const available = w - DAY_COL_W - 8 - (weeks.length - 1) * GAP;
      const size = Math.max(8, Math.min(16, Math.floor(available / Math.max(weeks.length, 1))));
      setCellSize(size);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks.length]);

  /* ---- tooltip ----
   * tooltip 弹在整个热力图下方(空间不够时上方),不遮挡任何格子,
   * 格子间扫动永不被拦截。safe-triangle 只保护「离开格子去点 tooltip」
   * 的移动路径:朝 tooltip 方向移动时扫过的格子延迟切换,其余立即。
   */
  const SWITCH_DELAY = 300;
  const [hovered, setHovered] = useState<{
    date: string; problems: HeatmapProblem[];
    /* 高度/宽度自适应,按可用空间单边锚定 */
    top?: number; bottom?: number; left?: number; right?: number;
  } | null>(null);
  const hoveredRef = useRef<typeof hovered>(null);
  hoveredRef.current = hovered;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringTooltip = useRef(false);
  const tooltipEl = useRef<HTMLDivElement | null>(null);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const clearHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const clearSwitch = () => { if (switchTimer.current) { clearTimeout(switchTimer.current); switchTimer.current = null; } };
  const closeTooltip = () => { if (!hoveringTooltip.current) setHovered(null); };

  /** 鼠标是否在「上次位置 → tooltip 近侧两角」的三角形内(= 正朝 tooltip 移动) */
  const movingTowardTooltip = (mx: number, my: number): boolean => {
    const prev = lastMouse.current;
    const rect = tooltipEl.current?.getBoundingClientRect();
    if (!prev || !rect) return false;
    // tooltip 在格子区下方/上方,取近侧横边两角;左右各放 8px 余量
    const nearY = prev.y < rect.top ? rect.top : rect.bottom;
    const ax = prev.x, ay = prev.y;
    const bx = rect.left - 8, by = nearY;
    const cx = rect.right + 8, cy = nearY;
    const sign = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
      (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    const d1 = sign(mx, my, ax, ay, bx, by);
    const d2 = sign(mx, my, bx, by, cx, cy);
    const d3 = sign(mx, my, cx, cy, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, date: string, problems: HeatmapProblem[]) => {
      if (problems.length === 0) return;
      clearHide();
      clearSwitch();
      const rect = e.currentTarget.getBoundingClientRect();
      // 弹在鼠标斜下方:垂直偏移让开当前行(水平扫不挡),
      // 水平锚在格子右缘让开当前列(竖直扫不挡)
      const OFFSET_Y = 18;
      const preferBelow = window.innerHeight - rect.bottom >= 260;
      const vAnchor = preferBelow
        ? { top: rect.bottom + OFFSET_Y }
        : { bottom: window.innerHeight - rect.top + OFFSET_Y };
      // 右侧放不下 TOOLTIP_MAX_W 时改左侧,锚格子左缘向左伸
      const hAnchor = window.innerWidth - rect.right - 8 >= TOOLTIP_MAX_W
        ? { left: rect.right + 4 }
        : { right: window.innerWidth - rect.left + 4 };
      const next = { date, problems, ...vAnchor, ...hAnchor };

      const cur = hoveredRef.current;
      if (!cur || cur.date === date || !movingTowardTooltip(e.clientX, e.clientY)) {
        // 没有 tooltip / 同一格子 / 鼠标并非朝 tooltip 移动 → 立即切换,保持流畅
        setHovered(next);
      } else {
        // 正朝 tooltip 移动途中扫过别的格子 → 停留够久才切换(护住点击路径)
        switchTimer.current = setTimeout(() => { setHovered(next); }, SWITCH_DELAY);
      }
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  /* ---- year dropdown click-outside ---- */
  const handleYearSelect = (y: number | null) => { setSelectedYear(y); setYearOpen(false); };

  const label = selectedYear ? `${selectedYear}` : "过去一年";

  return (
    <div className="select-none">
      {/* ---- header row: stats + year selector ---- */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-sm font-semibold" style={{ color: "var(--accent-text)" }}>{totalProblems}</span> 题
          </span>
          <span>
            <span className="text-sm font-semibold text-foreground/80">{totalCount}</span> 活跃天
          </span>
          {maxStreak > 1 && (
            <span>
              最长连续 <span className="text-sm font-semibold text-foreground/80">{maxStreak}</span> 天
            </span>
          )}
          {bestDay > 0 && (
            <span className="hidden sm:inline">
              单日最多 <span className="text-sm font-semibold text-foreground/80">{bestDay}</span> 题
            </span>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setYearOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md px-3 py-1 transition-colors"
            style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}
          >
            {label}
            <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${yearOpen ? "rotate-180" : ""}`}>
              <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {yearOpen && (
            <div className="absolute right-0 top-full mt-1 rounded-md py-1 shadow-lg z-30 min-w-[110px]" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <button
                onClick={() => handleYearSelect(null)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!selectedYear ? "font-medium" : "text-muted-foreground hover:text-foreground"}`}
                style={!selectedYear ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : {}}
              >
                过去一年
              </button>
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => handleYearSelect(y)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${selectedYear === y ? "font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  style={selectedYear === y ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : {}}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- grid area ---- */}
      <div className="rounded-lg p-3" ref={containerRef} style={{ background: "var(--heatmap-bg)" }}>
        <div className="flex justify-center">
          <div className="flex flex-col">
            {/* month labels: GitHub 式,每个标签绝对定位到所属周的列 */}
            <div
              className="relative mb-1 h-4"
              style={{ marginLeft: DAY_COL_W + 8, width: weeks.length * (cellSize + GAP) - GAP }}
            >
              {months
                // 开头不足 3 周的残月标签会和下一个月挤在一起,直接不显示
                .filter((m, i) => i === months.length - 1 || months[i + 1].col - m.col >= 3)
                .map((m) => (
                  <span
                    key={`${m.label}-${m.col}`}
                    className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                    style={{ left: m.col * (cellSize + GAP) }}
                  >
                    {m.label}
                  </span>
                ))}
            </div>

            <div className="flex">
              {/* day labels */}
              <div className="flex flex-col mr-2 pt-[1px]" style={{ gap: GAP, width: DAY_COL_W + "px" }}>
                {DAY_LABELS.map((day, i) => (
                  <div
                    key={i}
                    style={{ width: DAY_COL_W + "px", height: cellSize + "px", lineHeight: cellSize + "px" }} className="text-[10px] text-muted-foreground text-right pr-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* cells */}
              <div className="flex" style={{ gap: GAP }}>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                    {week.map((cell) => (
                      <div
                        key={cell.date}
                        className={`heatmap-cell rounded-[3px] transition-colors ${cell.count > 0 ? "cursor-pointer heatmap-cell-active" : ""}`}
                        style={{ width: cellSize + "px", height: cellSize + "px", background: getColor(cell.count) }}
                        onMouseEnter={(e) => handleMouseEnter(e, cell.date, cell.problems)}
                        onMouseLeave={() => { clearSwitch(); hideTimer.current = setTimeout(closeTooltip, 200); }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* legend */}
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[10px] text-muted-foreground mr-1">少</span>
          {COLORS.map((c, i) => (
            <div key={i} className="rounded-[3px]" style={{ width: cellSize + "px", height: cellSize + "px", background: c }} />
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">多</span>
        </div>
      </div>

      {/* ---- tooltip portal ---- */}
      {hovered &&
        createPortal(
          <div
            ref={tooltipEl}
            className="fixed z-50"
            style={{ left: hovered.left, right: hovered.right, top: hovered.top, bottom: hovered.bottom }}
            onMouseEnter={() => { hoveringTooltip.current = true; clearHide(); clearSwitch(); }}
            onMouseLeave={() => { hoveringTooltip.current = false; setHovered(null); }}
          >
            {/* 宽度自适应内容;超长题名单行截断(hover 原生 title 看全名) */}
            <div className="rounded-lg px-3 py-2 shadow-lg text-xs w-max min-w-44 pointer-events-auto" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", maxWidth: TOOLTIP_MAX_W }}>
              <div className="text-muted-foreground mb-1">
                {(() => {
                  const d = new Date(hovered.date + "T00:00:00");
                  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_DAYS_FULL[d.getDay()]}`;
                })()}
              </div>
              <div className="font-semibold mb-1 text-foreground">{hovered.problems.length} 题</div>
              {hovered.problems.length > 0 && (
                <div className="space-y-0.5 max-h-44 overflow-y-auto">
                  {hovered.problems.map((p) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={p.name}
                      className="block whitespace-nowrap overflow-hidden text-ellipsis leading-relaxed font-mono"
                      style={{ color: "var(--accent-text)" }}
                    >
                      {p.name}{p.score ? ` (${p.score})` : ""}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
