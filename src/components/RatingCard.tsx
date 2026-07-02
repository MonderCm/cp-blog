"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  /** UTC 时间戳,CF 式连续时间轴的 X 值 */
  ts: number;
  CF: number | null;
  AtC: number | null;
  NC: number | null;
  cfContest?: string;
  cfContestUrl?: string;
  cfRank?: number;
  cfOld?: number;
  atcContest?: string;
  atcContestUrl?: string;
  atcOld?: number;
  ncOld?: number;
  cfChanged?: boolean;
  atcChanged?: boolean;
  ncChanged?: boolean;
}

/* tooltip 内容;由自管理的悬浮层渲染(recharts 原生 tooltip 跟随鼠标,无法点击链接) */
function RatingTipContent({ d }: { d: ChartPoint }) {
  const platforms: { key: string; color: string; rating: number | null; contest?: string; contestUrl?: string; rank?: number; old?: number; changed?: boolean }[] = [
    { key: "CF", color: "#6366f1", rating: d.CF, contest: d.cfContest, contestUrl: d.cfContestUrl, rank: d.cfRank, old: d.cfOld, changed: d.cfChanged },
    { key: "AtC", color: "#10b981", rating: d.AtC, contest: d.atcContest, contestUrl: d.atcContestUrl, old: d.atcOld, changed: d.atcChanged },
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
              p.contestUrl ? (
                <a
                  href={p.contestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-1 px-2 py-1 rounded-md text-[11px] max-w-[280px] text-foreground/70 hover:text-foreground hover:underline"
                  style={{ wordBreak: "break-word", whiteSpace: "normal", background: "var(--surface-bg)", borderLeft: `2px solid ${p.color}` }}
                >
                  {p.contest}
                </a>
              ) : (
                <div className="mb-1 px-2 py-1 rounded-md text-[11px] max-w-[280px] text-foreground/70" style={{ wordBreak: "break-word", whiteSpace: "normal", background: "var(--surface-bg)", borderLeft: `2px solid ${p.color}` }}>
                  {p.contest}
                </div>
              )
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

/* CF 官方段位色阶(与 codeforces.com rating graph 一致) */
const CF_BANDS = [
  { lo: 0,    hi: 1200, color: "#cccccc", name: "Newbie" },
  { lo: 1200, hi: 1400, color: "#77ff77", name: "Pupil" },
  { lo: 1400, hi: 1600, color: "#77ddbb", name: "Specialist" },
  { lo: 1600, hi: 1900, color: "#aaaaff", name: "Expert" },
  { lo: 1900, hi: 2100, color: "#ff88ff", name: "Candidate Master" },
  { lo: 2100, hi: 2300, color: "#ffcc88", name: "Master" },
  { lo: 2300, hi: 2400, color: "#ffbb55", name: "International Master" },
  { lo: 2400, hi: 2600, color: "#ff7777", name: "Grandmaster" },
  { lo: 2600, hi: 3000, color: "#ff3333", name: "International Grandmaster" },
  { lo: 3000, hi: 5000, color: "#aa0000", name: "Legendary Grandmaster" },
];

function getCFColor(r: number) {
  for (const b of CF_BANDS) if (r < b.hi) return b.color;
  return CF_BANDS[CF_BANDS.length - 1].color;
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

/* ---- 条件圆点:只在该平台 rating 变了时渲染 ----
 * CF 官网样式:白心 + 彩色描边;有比赛链接时可点击跳转 */
function makeDot(
  color: string,
  changedKey: "cfChanged" | "atcChanged" | "ncChanged",
  urlKey?: "cfContestUrl" | "atcContestUrl",
  r = 2,
) {
  return (props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload[changedKey] || cx == null || cy == null) return null;
    const url = urlKey ? payload[urlKey] : undefined;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#fff"
        stroke={color}
        strokeWidth={1}
        style={url ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
        onClick={url ? () => window.open(url, "_blank", "noopener,noreferrer") : undefined}
      >
        <title>{url ? "点击查看比赛" : payload.date}</title>
      </circle>
    );
  };
}
/* 每个段位的下边界都是一个 tick,颜色取该段位色 */
const CF_TICKS = CF_BANDS.map(b => b.lo);
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

/* ---- safe-triangle:鼠标是否在「上次位置 → tooltip 近侧两角」的三角形内(= 正朝 tooltip 移动) ---- */
function movingTowardRect(rect: DOMRect, prev: { x: number; y: number }, mx: number, my: number): boolean {
  const sign = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const inTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    const d1 = sign(mx, my, ax, ay, bx, by);
    const d2 = sign(mx, my, bx, by, cx, cy);
    const d3 = sign(mx, my, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  // 取离上次位置最近的一条边作为目标边,两端各放 8px 余量
  if (prev.x < rect.left || prev.x > rect.right) {
    const nearX = prev.x < rect.left ? rect.left : rect.right;
    return inTri(prev.x, prev.y, nearX, rect.top - 8, nearX, rect.bottom + 8);
  }
  const nearY = prev.y < rect.top ? rect.top : rect.bottom;
  return inTri(prev.x, prev.y, rect.left - 8, nearY, rect.right + 8, nearY);
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

function formatTimeTick(ts: number, timeTicks: number[], isYearly: boolean): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (isYearly) return String(y);
  // 首个刻度和每年1月带年份,其余只显示月份
  if (m === 1 || timeTicks[0] === ts) return `${y}年${m}月`;
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

  /* ---- 自管理 tooltip:悬浮期间可移入点击比赛链接,延迟隐藏 ----
   * 注意 recharts v3 的 onMouseMove 参数没有 activePayload(v2 才有),
   * 只能拿 activeTooltipIndex 回 chartData 里查。 */
  const [tip, setTip] = useState<{ point: ChartPoint; x: number; y: number; alignRight: boolean; wrapW: number } | null>(null);
  const tipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipIdxRef = useRef<number | null>(null);
  const tipLayerRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const clearTipHide = useCallback(() => {
    if (tipHideTimer.current) { clearTimeout(tipHideTimer.current); tipHideTimer.current = null; }
  }, []);
  const clearTipSwitch = useCallback(() => {
    if (tipSwitchTimer.current) { clearTimeout(tipSwitchTimer.current); tipSwitchTimer.current = null; }
  }, []);
  const scheduleTipHide = useCallback(() => {
    clearTipHide();
    clearTipSwitch();
    tipHideTimer.current = setTimeout(() => { tipIdxRef.current = null; setTip(null); }, 250);
  }, [clearTipHide, clearTipSwitch]);
  const closeTip = useCallback(() => { tipIdxRef.current = null; setTip(null); }, []);

  // 合并数据：三平台都用 contest-level 精确点
  const chartData = useMemo(() => {
    const allDates = new Set<string>();
    const cfContestMap: Record<string, { rating: number; contest: string; url: string; rank: number; old: number }> = {};
    const atcContestMap: Record<string, { rating: number; contest: string; url: string; old: number }> = {};
    const ncContestMap: Record<string, { rating: number; old: number }> = {};

    const norm = (d: string) => d.replace(/\//g, "-");

    for (const h of cfContestHistory || []) {
      if (h.newRating === h.oldRating) continue;
      const date = norm(h.date);
      allDates.add(date);
      cfContestMap[date] = { rating: h.newRating, contest: h.contestName, url: h.contestUrl, rank: h.rank, old: h.oldRating };
    }
    for (const h of atcContestHistory || []) {
      if (h.newRating === h.oldRating) continue;
      const date = norm(h.date);
      allDates.add(date);
      atcContestMap[date] = { rating: h.newRating, contest: h.contestName, url: h.contestUrl, old: h.oldRating };
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
      const pt: ChartPoint = { date, ts: new Date(date).getTime(), CF: cfVal, AtC: atcVal, NC: ncVal };
      if (cfC) { pt.cfContest = cfC.contest; pt.cfContestUrl = cfC.url; pt.cfRank = cfC.rank; pt.cfOld = cfC.old; pt.cfChanged = true; }
      if (atcC) { pt.atcContest = atcC.contest; pt.atcContestUrl = atcC.url; pt.atcOld = atcC.old; pt.atcChanged = true; }
      if (ncC) { pt.ncOld = ncC.old; pt.ncChanged = true; }
      result.push(pt);
      if (cfC) lastCF = cfC.rating;
      if (atcC) lastAtC = atcC.rating;
      if (ncC) lastNC = ncC.rating;
    }

    return result;
  }, [cfContestHistory, atcContestHistory, ncContestHistory]);

  /* ---- X 轴:CF 式连续时间轴,刻度落在月份边界(时间戳),横向距离与真实时间成正比 ---- */
  const { timeTicks, isYearly, xDomain } = useMemo(() => {
    if (chartData.length === 0) return { timeTicks: [] as number[], isYearly: false, xDomain: [0, 1] as [number, number] };
    const dates = chartData.map(p => p.date);
    const buckets = computeTimeTicks(dates); // "YYYY-MM" 月份/年份桶
    const ticks = buckets.map(b => new Date(`${b}-01`).getTime());
    const firstTs = chartData[0].ts;
    const lastTs = chartData[chartData.length - 1].ts;
    const span = (lastTs - firstTs) / 86400000;
    // 域从首个月份边界(或首个数据点,取更早者)到最后一个数据点,与 CF 一致
    const domain: [number, number] = [Math.min(ticks[0] ?? firstTs, firstTs), lastTs];
    return { timeTicks: ticks, isYearly: span > 365 * 2, xDomain: domain };
  }, [chartData]);

  /* Y 轴上限:取数据最高分所在段位的上边界再多一档,低分用户不被压扁 */
  const domainMax = useMemo(() => {
    let peak = 0;
    for (const p of chartData) {
      for (const v of [p.CF, p.AtC, p.NC]) if (v != null && v > peak) peak = v;
    }
    const idx = CF_BANDS.findIndex(b => peak < b.hi);
    const next = CF_BANDS[Math.min(idx + 1, CF_BANDS.length - 1)];
    return Math.min(next.hi, 4000);
  }, [chartData]);

  const applyTip = useCallback((idx: number, coord: { x: number; y: number }) => {
    const point = chartData[idx];
    if (!point) return;
    tipIdxRef.current = idx;
    const w = chartWrapRef.current?.offsetWidth ?? 0;
    setTip({ point, x: coord.x, y: coord.y, alignRight: coord.x > w / 2, wrapW: w });
  }, [chartData]);

  const handleChartMove = useCallback((state: {
    isTooltipActive?: boolean;
    activeTooltipIndex?: number | string | null;
    activeCoordinate?: { x: number; y: number };
  }, e?: { clientX?: number; clientY?: number }) => {
    if (state?.activeTooltipIndex == null) return;
    const idx = Number(state.activeTooltipIndex);
    const coord = state.activeCoordinate;
    if (!state.isTooltipActive || !coord || !Number.isInteger(idx)) return;
    clearTipHide();
    const mx = e?.clientX, my = e?.clientY;
    const prev = lastMouseRef.current;
    if (mx != null && my != null) lastMouseRef.current = { x: mx, y: my };
    // 活动点没变就不 setState——否则每次 mousemove 都整卡重渲染
    if (idx === tipIdxRef.current) return;
    clearTipSwitch();
    // safe-triangle:tooltip 已显示且鼠标正朝它移动 → 延迟切换,护住点击路径;其余立即切换
    const rect = tipLayerRef.current?.getBoundingClientRect();
    if (tipIdxRef.current != null && rect && prev && mx != null && my != null && movingTowardRect(rect, prev, mx, my)) {
      tipSwitchTimer.current = setTimeout(() => applyTip(idx, coord), 150);
    } else {
      applyTip(idx, coord);
    }
  }, [applyTip, clearTipHide, clearTipSwitch]);

  /* 图表整体 memo:tooltip 状态变化时不重新协调几百个 SVG 节点,消除 hover 卡顿 */
  const chartEl = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartData}
        margin={{ top: 12, right: 8, left: 8, bottom: 4 }}
        onMouseMove={handleChartMove}
        onMouseLeave={scheduleTipHide}
      >
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={xDomain}
          ticks={timeTicks}
          tickFormatter={(v: number) => formatTimeTick(v, timeTicks, isYearly)}
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={<CFTick />}
          ticks={CF_TICKS.filter(t => t <= domainMax)}
          axisLine={false}
          tickLine={false}
          width={44}
          domain={[0, domainMax]}
        />
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
        {/* CF 段位背景色带(官方划分,见 CF_BANDS;饱和度仿 CF 官网) */}
        {CF_BANDS.filter(b => b.lo < domainMax).map(b => (
          <ReferenceArea
            key={b.lo}
            y1={b.lo}
            y2={Math.min(b.hi, domainMax)}
            fill={b.color}
            fillOpacity={0.35}
            label={{
              value: b.name,
              position: "insideTopRight",
              fontSize: 9,
              fill: "#666",
              opacity: 0.7,
              dx: -4,
              dy: 2,
            }}
          />
        ))}
        {/* 原生 tooltip 只保留 cursor 参考线,内容由自管理悬浮层渲染 */}
        <Tooltip content={() => null} cursor={{ stroke: "var(--surface-border)" }} />
        <Area
          type="monotone"
          dataKey="CF"
          stroke={cfStroke}
          strokeWidth={1.5}
          fill="none"
          dot={makeDot(cfStroke, "cfChanged", "cfContestUrl")}
          activeDot={false}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="AtC"
          stroke={atcStroke}
          strokeWidth={1.5}
          fill="none"
          dot={makeDot(atcStroke, "atcChanged", "atcContestUrl")}
          activeDot={false}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="NC"
          stroke={ncStroke}
          strokeWidth={1.5}
          fill="none"
          dot={makeDot(ncStroke, "ncChanged")}
          activeDot={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  ), [chartData, domainMax, timeTicks, isYearly, xDomain, handleChartMove, scheduleTipHide]);

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
          <div className="h-80 relative" ref={chartWrapRef}>
          {chartEl}
          {/* 自管理悬浮层:跟随数据点定位,延迟隐藏,鼠标可移入点击比赛链接 */}
          {tip && (
            <div
              ref={tipLayerRef}
              className="absolute z-20"
              style={{
                top: Math.max(4, tip.y - 30),
                ...(tip.alignRight
                  ? { right: tip.wrapW - tip.x + 14 }
                  : { left: tip.x + 14 }),
              }}
              onMouseEnter={() => { clearTipHide(); clearTipSwitch(); }}
              onMouseLeave={closeTip}
            >
              <RatingTipContent d={tip.point} />
            </div>
          )}
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
