"use client";

import { useMemo, useState } from "react";

interface HeatmapProps {
  submissions: Record<string, string[]>;
}

const THEMES = {
  green: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

function getColor(count: number): string {
  if (count === 0) return THEMES.green[0];
  if (count <= 2) return THEMES.green[1];
  if (count <= 4) return THEMES.green[2];
  if (count <= 8) return THEMES.green[3];
  return THEMES.green[4];
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export default function Heatmap({ submissions }: HeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    date: string;
    count: number;
    tags: string[];
    x: number;
    y: number;
  } | null>(null);

  const { weeks, months, totalCount } = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 364);

    const weeks: { date: string; count: number; tags: string[]; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; count: number; tags: string[]; dayOfWeek: number }[] = [];

    const iterDate = new Date(startDate);
    while (iterDate.getDay() !== 0) {
      iterDate.setDate(iterDate.getDate() - 1);
    }

    const endDate = new Date(now);
    const monthPositions: { label: string; col: number }[] = [];
    let lastMonth = -1;
    let colIndex = 0;

    while (iterDate <= endDate) {
      const dateStr = iterDate.toISOString().slice(0, 10);
      const tags = submissions[dateStr] || [];
      const count = tags.length;

      const month = iterDate.getMonth();
      if (month !== lastMonth) {
        monthPositions.push({ label: MONTH_LABELS[month], col: colIndex });
        lastMonth = month;
      }

      currentWeek.push({ date: dateStr, count, tags, dayOfWeek: iterDate.getDay() });

      if (iterDate.getDay() === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
        colIndex++;
      }

      iterDate.setDate(iterDate.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    let total = 0;
    for (const week of weeks) {
      for (const cell of week) if (cell.count > 0) total++;
    }

    return { weeks, months: monthPositions, totalCount: total };
  }, [submissions]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {totalCount} 天有刷题记录
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-hide">
        <div className="inline-flex flex-col min-w-max">
          {/* Month labels */}
          <div className="flex mb-1" style={{ paddingLeft: 28 }}>
            {months.map((m, i) => (
              <span
                key={i}
                className="text-[10px] text-muted-foreground"
                style={{
                  position: "relative",
                  left: `${m.col * 12}px`,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex">
            <div className="flex flex-col gap-[3px] mr-2 pt-1">
              {DAY_LABELS.map((day, i) => (
                <div
                  key={day}
                  className="w-7 h-[11px] text-[10px] text-muted-foreground leading-[11px]"
                  style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      className="w-[11px] h-[11px] rounded-sm relative cursor-pointer"
                      style={{ background: getColor(cell.count) }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setHoveredCell({
                          date: cell.date,
                          count: cell.count,
                          tags: cell.tags,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground justify-end">
        <span>少</span>
        {THEMES.green.map((color, i) => (
          <div key={i} className="w-[11px] h-[11px] rounded-sm" style={{ background: color }} />
        ))}
        <span>多</span>
      </div>

      {hoveredCell && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredCell.x, top: hoveredCell.y - 8 }}
        >
          <div className="bg-zinc-900 border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl text-xs whitespace-nowrap">
            <div className="text-muted-foreground">
              {new Date(hoveredCell.date + "T00:00:00").toLocaleDateString("zh-CN", {
                month: "long", day: "numeric", weekday: "short",
              })}
            </div>
            <div className="font-semibold mt-0.5">
              {hoveredCell.count > 0 ? `${hoveredCell.count} 道题` : "无记录"}
            </div>
            {hoveredCell.tags.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap max-w-48">
                {[...new Set(hoveredCell.tags)].map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}