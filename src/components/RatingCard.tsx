"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  CartesianGrid,
} from "recharts";
import Heatmap from "@/components/Heatmap";
import type { HeatmapProblem } from "@/components/Heatmap";
import type { CFContestHistoryEntry } from "@/lib/cf-api";
import type { AtCContestHistoryEntry } from "@/lib/atc-api";
import type { NCContestHistoryEntry } from "@/lib/nc-api";

interface RatingData {
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

interface RatingCardProps {
  cf: RatingData;
  atc: RatingData;
  nc: RatingData;
  cfContestHistory: CFContestHistoryEntry[];
  atcContestHistory: AtCContestHistoryEntry[];
  ncContestHistory: NCContestHistoryEntry[];
  heatmapData: Record<string, HeatmapProblem[]>;
  loading: boolean;
}

interface ChartPoint {
  date: string;
  CF: number | null;
  AtC: number | null;
  NC: number | null;
  cfContest?: string;
  cfRank?: number;
  cfOld?: number;
  atcContest?: string;
  atcOld?: number;
  ncOld?: number;
  cfChanged?: boolean;
  atcChanged?: boolean;
  ncChanged?: boolean;
}

interface TooltipPayload {
  payload: ChartPoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  const platforms: { key: string; color: string; rating: number | null; contest?: string; rank?: number; old?: number; changed?: boolean }[] = [
    { key: "CF", color: "#6366f1", rating: d.CF, contest: d.cfContest, rank: d.cfRank, old: d.cfOld, changed: d.cfChanged },
    { key: "AtC", color: "#10b981", rating: d.AtC, contest: d.atcContest, old: d.atcOld, changed: d.atcChanged },
    { key: "NC", color: "#f59e0b", rating: d.NC, old: d.ncOld, changed: d.ncChanged },
  ];

  return (
    <div className="rounded-lg px-3 py-2 shadow-lg text-xs" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="text-muted-foreground mb-1.5 font-medium">{d.date}</div>
      {platforms.map((p) => {
        if (p.rating == null) return null;
        const diff = p.changed ? p.rating - (p.old ?? p.rating) : 0;
        const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
        return (
          <div key={p.key} className="mb-1.5">
            {p.changed && p.contest && (
              <div className="mb-1 px-2 py-1 rounded-md text-[11px] max-w-[280px] text-foreground/70" style={{ wordBreak: "break-word", whiteSpace: "normal", background: "var(--surface-bg)", borderLeft: `2px solid ${p.color}` }}>
                {p.contest}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-0.5 rounded-full" style={{ background: p.color }} />
              <span className="font-medium" style={{ color: p.color }}>{p.key}</span>
              <span className="tabular-nums font-semibold">{p.rating}</span>
              {p.changed && diff !== 0 && (
                <span className="text-muted-foreground">({sign}{Math.abs(diff)})</span>
              )}
              {p.changed && p.rank != null && (
                <span className="text-muted-foreground ml-auto">rank {p.rank}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getCFColor(r: number) {
  if (r < 1200) return "#cccccc";
  if (r < 1400) return "#77ff77";
  if (r < 1600) return "#77ddbb";
  if (r < 1900) return "#aaaaff";
  if (r < 2100) return "#ff88ff";
  if (r < 2400) return "#ffcc88";
  return "#ff7777";
}

function getATCColor(r: number) {
  if (r < 400) return "#808080";
  if (r < 800) return "#804000";
  if (r < 1200) return "#008000";
  if (r < 1600) return "#00c0c0";
  if (r < 2000) return "#0000ff";
  if (r < 2400) return "#c0c000";
  if (r < 2800) return "#ff8000";
  return "#ff0000";
}

function getNCColor(r: number) {
  if (r < 1200) return "#cccccc";
  if (r < 1400) return "#77ff77";
  if (r < 1600) return "#77ddbb";
  if (r < 1900) return "#aaaaff";
  if (r < 2100) return "#ff88ff";
  if (r < 2400) return "#ffcc88";
  return "#ff7777";
}

/* ---- 条件圆点：只在该平台 rating 变了时渲染 ---- */
function makeDot(color: string, changedKey: "cfChanged" | "atcChanged" | "ncChanged") {
  return (props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload[changedKey] || cx == null || cy == null) return null;
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  };
}
const CF_TICKS = [0, 1200, 1400, 1600, 1900, 2100, 2400];
function CFTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  const v = payload?.value ?? 0;
  if (v === 0) return null;
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="central"
      fontSize={10} fill={getCFColor(v)} fontWeight={600}>
      {v}
    </text>
  );
}

/* ---- X轴：按比赛实际时间自适应 ---- */
function computeTimeTicks(allDates: string[]): string[] {
  if (allDates.length === 0) return [];
  const sorted = [...allDates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const spanMonths = (ly - fy) * 12 + (lm - fm) + 1;

  // 短于2年：每两个月一个tick，格式"3月"/"Jan"
  if (spanMonths <= 24) {
    const ticks: string[] = [];
    for (let y = fy; y <= ly; y++) {
      for (let m = 1; m <= 12; m += 2) {
        if (y === fy && m < fm) continue;
        if (y === ly && m > lm) continue;
        ticks.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    return ticks;
  }

  // 长于2年：年份tick
  const ticks: string[] = [];
  for (let y = fy; y <= ly; y++) {
    ticks.push(`${y}-01`);
  }
  return ticks;
}

function formatTimeTick(date: string, timeTicks: string[], isYearly: boolean): string {
  const [y, m] = date.split("-").map(Number);
  if (isYearly) return String(y);
  // 2-month ticks: 每年1月显示"2025年1月"，其他显示"3月"
  if (m === 1) return `${y}年${m}月`;
  return `${m}月`;
}

export default function RatingCard({ cf, atc, nc, cfContestHistory, atcContestHistory, ncContestHistory, heatmapData, loading }: RatingCardProps) {
  const cfHex = getCFColor(cf.rating);
  const atcHex = getATCColor(atc.rating);
  const ncHex = getNCColor(nc.rating);
  // 曲线固定平台色,与图例保持一致(白主题用更深的版本)
  const cfStroke = "#6366f1";
  const atcStroke = "#10b981";
  const ncStroke = "#f59e0b";

  /* ---- 计算时间轴 ticks ---- */
  const { timeTicks, isYearly } = useMemo(() => {
    const allDates = [
      ...(cf.history || []).map(h => h.date),
      ...(atc.history || []).map(h => h.date),
      ...(nc.history || []).map(h => h.date),
    ].map(d => d.replace(/\//g, "-"));
    const ticks = computeTimeTicks(allDates);
    const span = allDates.length > 0
      ? (new Date(allDates.sort().pop()!).getTime() - new Date(allDates.sort()[0]).getTime()) / 86400000
      : 0;
    return { timeTicks: ticks, isYearly: span > 365 * 2 };
  }, [cf.history, atc.history, nc.history]);

  // 合并数据：三平台都用 contest-level 精确点
  const chartData = useMemo(() => {
    const allDates = new Set<string>();
    const cfContestMap: Record<string, { rating: number; contest: string; rank: number; old: number }> = {};
    const atcContestMap: Record<string, { rating: number; contest: string; old: number }> = {};
    const ncContestMap: Record<string, { rating: number; old: number }> = {};

    const norm = (d: string) => d.replace(/\//g, "-");

    for (const h of cfContestHistory || []) {
      if (h.newRating === h.oldRating) continue;
      const date = norm(h.date);
      allDates.add(date);
      cfContestMap[date] = { rating: h.newRating, contest: h.contestName, rank: h.rank, old: h.oldRating };
    }
    for (const h of atcContestHistory || []) {
      if (h.newRating === h.oldRating) continue;
      const date = norm(h.date);
      allDates.add(date);
      atcContestMap[date] = { rating: h.newRating, contest: h.contestName, old: h.oldRating };
    }
    for (const h of ncContestHistory || []) {
      if (h.newRating === h.oldRating) continue;
      const date = norm(h.date);
      allDates.add(date);
      ncContestMap[date] = { rating: h.newRating, old: h.oldRating };
    }

    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return [];

    const result: ChartPoint[] = [];
    let lastCF: number | null = null;
    let lastAtC: number | null = null;
    let lastNC: number | null = null;

    for (const date of sortedDates) {
      const cfC = cfContestMap[date];
      const atcC = atcContestMap[date];
      const ncC = ncContestMap[date];
      const cfVal = cfC ? cfC.rating : lastCF;
      const atcVal = atcC ? atcC.rating : lastAtC;
      const ncVal = ncC ? ncC.rating : lastNC;
      const pt: ChartPoint = { date, CF: cfVal, AtC: atcVal, NC: ncVal };
      if (cfC) { pt.cfContest = cfC.contest; pt.cfRank = cfC.rank; pt.cfOld = cfC.old; pt.cfChanged = true; }
      if (atcC) { pt.atcContest = atcC.contest; pt.atcOld = atcC.old; pt.atcChanged = true; }
      if (ncC) { pt.ncOld = ncC.old; pt.ncChanged = true; }
      result.push(pt);
      if (cfC) lastCF = cfC.rating;
      if (atcC) lastAtC = atcC.rating;
      if (ncC) lastNC = ncC.rating;
    }

    return result;
  }, [cfContestHistory, atcContestHistory, ncContestHistory]);

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="relative z-10">
        {/* ---- 三个平台卡片并排 ---- */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {/* Codeforces */}
          <div className="surface p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[#6366f1] tracking-wide">CF</span>
              <span className="text-[11px] text-muted-foreground font-mono">@{cf.handle}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-2xl font-bold tabular-nums" style={{ color: cfHex, fontFamily: "'JetBrains Mono', monospace" }}>
                {cf.rating}
              </span>
              <span className="text-xs font-medium" style={{ color: cfHex }}>{cf.rank}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              max {cf.maxRating}
            </div>
          </div>

          {/* AtCoder */}
          <div className="surface p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[#10b981] tracking-wide">AtC</span>
              <span className="text-[11px] text-muted-foreground font-mono">@{atc.handle}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-2xl font-bold tabular-nums" style={{ color: atcHex, fontFamily: "'JetBrains Mono', monospace" }}>
                {atc.rating}
              </span>
              <span className="text-xs font-medium" style={{ color: atcHex }}>{atc.rank}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              max {atc.maxRating}
            </div>
          </div>

          {/* 牛客网 */}
          <div className="surface p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[#f59e0b] tracking-wide">NC</span>
              <span className="text-[11px] text-muted-foreground font-mono">@{nc.handle}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-2xl font-bold tabular-nums" style={{ color: ncHex, fontFamily: "'JetBrains Mono', monospace" }}>
                {nc.rating}
              </span>
              <span className="text-xs font-medium" style={{ color: ncHex }}>{nc.rank}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              max {nc.maxRating}
            </div>
          </div>
        </div>

        {/* ---- 合并曲线图 ---- */}
        <div className="mb-5">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded-full bg-[#6366f1] inline-block" />
              Codeforces
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded-full bg-[#10b981] inline-block" />
              AtCoder
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded-full bg-[#f59e0b] inline-block" />
              牛客网
            </span>
          </div>
          <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cfStroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={cfStroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="atcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={atcStroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={atcStroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ncGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ncStroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={ncStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                ticks={timeTicks}
                tickFormatter={(v: string) => formatTimeTick(v, timeTicks, isYearly)}
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={<CFTick />}
                ticks={CF_TICKS}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={[0, 3200]}
              />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              {/* CF 段位背景色带 */}
              <ReferenceArea y1={0} y2={1200} fill="#cccccc" fillOpacity={0.12} />
              <ReferenceArea y1={1200} y2={1400} fill="#77ff77" fillOpacity={0.12} />
              <ReferenceArea y1={1400} y2={1600} fill="#77ddbb" fillOpacity={0.12} />
              <ReferenceArea y1={1600} y2={1900} fill="#aaaaff" fillOpacity={0.12} />
              <ReferenceArea y1={1900} y2={2100} fill="#ff88ff" fillOpacity={0.12} />
              <ReferenceArea y1={2100} y2={2400} fill="#ffcc88" fillOpacity={0.12} />
              <ReferenceArea y1={2400} y2={5000} fill="#ff7777" fillOpacity={0.12} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="CF"
                stroke={cfStroke}
                strokeWidth={1.5}
                fill="url(#cfGrad)"
                dot={makeDot(cfStroke, "cfChanged")}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="AtC"
                stroke={atcStroke}
                strokeWidth={1.5}
                fill="url(#atcGrad)"
                dot={makeDot(atcStroke, "atcChanged")}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="NC"
                stroke={ncStroke}
                strokeWidth={1.5}
                fill="url(#ncGrad)"
                dot={makeDot(ncStroke, "ncChanged")}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* ---- 热力图 ---- */}
        <div className="border-t pt-4" style={{ borderColor: "var(--surface-border)" }}>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="text-muted-foreground">刷题热力图</span>{loading && <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin ml-1" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />}
          </h2>
          {loading && !Object.keys(heatmapData).length ? (
            <div className="surface rounded-lg h-[140px] flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground">加载中...</span>
            </div>
          ) : (
            <Heatmap submissions={heatmapData} />
          )}
        </div>
      </div>
    </div>
  );
}
