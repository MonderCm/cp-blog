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
  const { weeks, months, totalCount, totalProblems } = useMemo(() => {
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

    let tc = 0, tp = 0;
    for (const wk of w) for (const cell of wk) {
      if (cell.count > 0) { tc++; tp += cell.count; }
    }
    return { weeks: w, months: mPos, totalCount: tc, totalProblems: tp };
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

  /* ---- tooltip ---- */
  const [hovered, setHovered] = useState<{
    date: string; problems: HeatmapProblem[]; top: number; left: number;
  } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringTooltip = useRef(false);
  const clearHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const closeTooltip = () => { if (!hoveringTooltip.current) setHovered(null); };

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, date: string, problems: HeatmapProblem[]) => {
      if (problems.length === 0) return;
      clearHide();
      const rect = e.currentTarget.getBoundingClientRect();
      const tooltipW = 280;
      const spaceRight = window.innerWidth - rect.right - 8;
      const spaceLeft = rect.left - 8;
      const preferRight = spaceRight >= tooltipW || spaceRight >= spaceLeft;
      const left = preferRight ? rect.right + 8 : rect.left - tooltipW - 8;
      const top = rect.top - 4;
      setHovered({ date, problems, top, left });
    },
    []
  );

  /* ---- year dropdown click-outside ---- */
  const handleYearSelect = (y: number | null) => { setSelectedYear(y); setYearOpen(false); };

  const label = selectedYear ? `${selectedYear}` : "过去一年";

  return (
    <div className="select-none">
      {/* ---- header row: label + year selector ---- */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {totalCount} 天刷了 {totalProblems} 题
        </span>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setYearOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground bg-black/[0.03] hover:bg-black/[0.06] border border-black/[0.08] rounded-md px-3 py-1 transition-colors"
          >
            {label}
            <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${yearOpen ? "rotate-180" : ""}`}>
              <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {yearOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-black/[0.1] rounded-md py-1 shadow-lg z-30 min-w-[110px]">
              <button
                onClick={() => handleYearSelect(null)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-black/[0.04] transition-colors ${!selectedYear ? "text-indigo-600 bg-indigo-50" : "text-muted-foreground"}`}
              >
                过去一年
              </button>
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => handleYearSelect(y)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-black/[0.04] transition-colors ${selectedYear === y ? "text-indigo-600 bg-indigo-50" : "text-muted-foreground"}`}
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
            {/* month labels */}
            <div className="flex mb-1" style={{ paddingLeft: DAY_COL_W + 8 }}>
              {months.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] text-zinc-400"
                  style={{ position: "relative", left: `${m.col * (cellSize + GAP)}px` }}
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
                    style={{ width: DAY_COL_W + "px", height: cellSize + "px", lineHeight: cellSize + "px" }} className="text-[10px] text-zinc-400 text-right pr-1"
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
                        className="heatmap-cell rounded-[2px] cursor-pointer transition-colors hover:ring-1 hover:ring-zinc-300"
                        style={{ width: cellSize + "px", height: cellSize + "px", background: getColor(cell.count) }}
                        onMouseEnter={(e) => handleMouseEnter(e, cell.date, cell.problems)}
                        onMouseLeave={() => { hideTimer.current = setTimeout(closeTooltip, 200); }}
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
          <span className="text-[10px] text-zinc-400 mr-1">少</span>
          {COLORS.map((c, i) => (
            <div key={i} className="rounded-[2px]" style={{ width: cellSize + "px", height: cellSize + "px", background: c }} />
          ))}
          <span className="text-[10px] text-zinc-400 ml-1">多</span>
        </div>
      </div>

      {/* ---- tooltip portal ---- */}
      {hovered &&
        createPortal(
          <div
            className="fixed z-50"
            style={{ left: hovered.left, top: hovered.top }}
            onMouseEnter={() => { hoveringTooltip.current = true; clearHide(); }}
            onMouseLeave={() => { hoveringTooltip.current = false; setHovered(null); }}
          >
            <div className="bg-white border border-black/[0.1] rounded-lg px-3 py-2 shadow-lg text-xs w-72 pointer-events-auto">
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
                      className="block text-indigo-600 hover:text-indigo-800 hover:underline break-all leading-relaxed font-mono"
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
