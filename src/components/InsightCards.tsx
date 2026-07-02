"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PlatformBuckets, SubmissionDay } from "@/lib/types";

interface Props {
  subs: PlatformBuckets<SubmissionDay[]>;
}

type Platform = "cf" | "atc" | "nc";

const PLATFORM_COLOR: Record<Platform, string> = {
  cf:  "#6366f1", // 靛蓝
  atc: "#10b981", // 翠绿
  nc:  "#f59e0b", // 琥珀
};
const PLATFORM_LABEL: Record<Platform, string> = { cf: "CF", atc: "ATC", nc: "NC" };

/* ---------- 算法标签英 -> 中映射 ---------- */
const TAG_ZH: Record<string, string> = {
  "implementation": "模拟",
  "math": "数学",
  "greedy": "贪心",
  "dp": "动态规划",
  "dfs and similar": "搜索",
  "search": "搜索",
  "data structures": "数据结构",
  "brute force": "暴力枚举",
  "constructive algorithms": "构造",
  "graphs": "图论",
  "graph matchings": "图匹配",
  "trees": "树",
  "strings": "字符串",
  "string suffix structures": "后缀结构",
  "sortings": "排序",
  "binary search": "二分",
  "ternary search": "三分",
  "two pointers": "双指针",
  "number theory": "数论",
  "combinatorics": "组合数学",
  "probabilities": "概率",
  "geometry": "计算几何",
  "bitmasks": "状压",
  "shortest paths": "最短路",
  "dsu": "并查集",
  "divide and conquer": "分治",
  "hashing": "哈希",
  "games": "博弈",
  "matrices": "矩阵",
  "flows": "网络流",
  "ternary": "三分",
  "interactive": "交互",
  "expression parsing": "表达式解析",
  "chinese remainder theorem": "中国剩余定理",
  "fft": "FFT",
  "schedules": "调度",
  "2-sat": "2-SAT",
  "meet-in-the-middle": "折半",
  "math/number": "数论",
};

const tagToZh = (t: string) => TAG_ZH[t.toLowerCase().trim()] || t;

/* ---------- 给标签分配稳定颜色(基于字符串哈希) ---------- */
const TAG_PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6",
  "#06b6d4", "#84cc16", "#ef4444", "#f97316", "#14b8a6",
  "#a855f7", "#22c55e", "#eab308", "#0ea5e9", "#d946ef",
];
function colorOf(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

/* ---------- D1: 难度分布 ---------- */

interface DifficultyRow {
  bucket: string;
  cf: number; atc: number; nc: number; total: number;
}
const BUCKETS = [
  { label: "<800", lo: 0, hi: 799 },
  { label: "800-1199", lo: 800, hi: 1199 },
  { label: "1200-1599", lo: 1200, hi: 1599 },
  { label: "1600-1999", lo: 1600, hi: 1999 },
  { label: "2000-2399", lo: 2000, hi: 2399 },
  { label: "2400+", lo: 2400, hi: Infinity },
];

function buildDifficulty(subs: PlatformBuckets<SubmissionDay[]>): DifficultyRow[] {
  const rows: DifficultyRow[] = BUCKETS.map(b => ({ bucket: b.label, cf: 0, atc: 0, nc: 0, total: 0 }));
  const seen = new Set<string>();
  (Object.keys(subs) as Platform[]).forEach(platform => {
    for (const day of subs[platform]) {
      for (const p of day.problems) {
        const key = `${platform}#${p.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score = p.score || 0;
        if (score <= 0) continue;
        const idx = BUCKETS.findIndex(b => score >= b.lo && score <= b.hi);
        if (idx >= 0) { rows[idx][platform] += 1; rows[idx].total += 1; }
      }
    }
  });
  return rows;
}

/* ---------- D2: Top Tags ---------- */

function buildTopTags(subs: PlatformBuckets<SubmissionDay[]>, limit = 10): { tag: string; count: number; color: string }[] {
  const counter = new Map<string, number>();
  const seen = new Set<string>();
  for (const platform of ["cf", "atc", "nc"] as Platform[]) {
    for (const day of subs[platform]) {
      for (const p of day.problems) {
        const key = `${platform}#${p.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const raw of p.tags || []) {
          if (!raw) continue;
          const t = tagToZh(raw);
          counter.set(t, (counter.get(t) || 0) + 1);
        }
      }
    }
  }
  return Array.from(counter.entries())
    .map(([tag, count]) => ({ tag, count, color: colorOf(tag) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* ---------- D3: Streak ---------- */

interface StreakStats { current: number; longest: number; activeDays: number; totalProblems: number; }

function buildStreak(subs: PlatformBuckets<SubmissionDay[]>): StreakStats {
  // 打卡口径与热力图一致:当天有任何提交即算活跃(不按题目去重——
  // 否则重刷旧题的日子会被记为 0,连续天数被错误打断)
  const activeSet = new Set<string>();
  // 累计题数按题目去重
  const seen = new Set<string>();
  for (const platform of ["cf", "atc", "nc"] as Platform[]) {
    for (const day of subs[platform] || []) {
      if (!day.problems.length) continue;
      activeSet.add(day.date);
      for (const p of day.problems) seen.add(`${platform}#${p.id}`);
    }
  }
  const dates = Array.from(activeSet).sort();
  const activeDays = dates.length;
  const totalProblems = seen.size;

  if (activeDays === 0) return { current: 0, longest: 0, activeDays: 0, totalProblems: 0 };

  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    if (diff === 1) { run++; longest = Math.max(longest, run); } else run = 1;
  }

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const probe = new Date(today);
  if (!activeSet.has(fmt(probe))) probe.setDate(probe.getDate() - 1);
  let current = 0;
  while (activeSet.has(fmt(probe))) { current++; probe.setDate(probe.getDate() - 1); }

  return { current, longest, activeDays, totalProblems };
}

/* ---------- 难度分布 Tooltip ---------- */

function DifficultyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = (["cf", "atc", "nc"] as Platform[])
    .map(p => ({ p, value: Number(payload.find(e => e.dataKey === p)?.value ?? 0) }))
    .filter(r => r.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg text-xs" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="text-muted-foreground mb-1">{label}</div>
      {rows.map(r => (
        <div key={r.p} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ background: PLATFORM_COLOR[r.p] }} />
          <span className="text-foreground/80">{PLATFORM_LABEL[r.p]}</span>
          <span className="ml-auto tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1 pt-1" style={{ borderTop: "1px solid var(--surface-border)" }}>
        <span className="text-muted-foreground">合计</span>
        <span className="ml-auto tabular-nums font-semibold text-foreground">{total}</span>
      </div>
    </div>
  );
}

/* ---------- Donut 圆环组件 ---------- */

function Donut({ data, total }: { data: { tag: string; count: number; color: string }[]; total: number }) {
  if (total === 0) {
    return <div className="text-xs text-muted-foreground py-8 text-center">暂无标签</div>;
  }
  const cx = 60, cy = 60, r = 48, sw = 16;
  const C = 2 * Math.PI * r;
  // 预计算每个 segment 的累计 offset,避免 render 中修改外层变量(React 19 不变性规则)
  const segments = data.reduce<{ tag: string; color: string; count: number; len: number; offset: number }[]>((acc, d) => {
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ ...d, len: (d.count / total) * C, offset: prevOffset });
    return acc;
  }, []);
  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-border)" strokeWidth={sw} />
      {segments.map(d => {
        const dasharray = `${d.len} ${C - d.len}`;
        const dashoffset = -d.offset;
        return (
          <circle
            key={d.tag}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={sw}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{d.tag}: {d.count}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-current text-foreground" fontSize={14} fontWeight={600}>
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-current text-muted-foreground" fontSize={9}>
        题目数
      </text>
    </svg>
  );
}

/* ---------- 组件 ---------- */

export default function InsightCards({ subs }: Props) {
  const difficulty = useMemo(() => buildDifficulty(subs), [subs]);
  const topTags = useMemo(() => buildTopTags(subs), [subs]);
  const streak = useMemo(() => buildStreak(subs), [subs]);

  const tagsTotal = topTags.reduce((s, t) => s + t.count, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      {/* Streak */}
      <div className="card p-5">
        <div className="text-xs text-muted-foreground mb-3">打卡指标</div>
        <div className="grid grid-cols-2 gap-3">
          <StreakStat label="当前连续" value={streak.current} unit="天" accent="#f59e0b" />
          <StreakStat label="最长连续" value={streak.longest} unit="天" accent="#8b5cf6" />
          <StreakStat label="活跃天数" value={streak.activeDays} unit="天" accent="#10b981" />
          <StreakStat label="累计题数" value={streak.totalProblems} unit="" accent="#6366f1" />
        </div>
      </div>

      {/* Top Tags 圆环 */}
      <div className="card p-5">
        <div className="text-xs text-muted-foreground mb-3">算法标签分布</div>
        <div className="flex items-center gap-4">
          <Donut data={topTags} total={tagsTotal} />
          <div className="flex-1 space-y-1 min-w-0 max-h-32 overflow-y-auto pr-1">
            {topTags.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无数据</div>
            ) : topTags.map(t => {
              const pct = tagsTotal > 0 ? ((t.count / tagsTotal) * 100).toFixed(1) : "0";
              return (
                <div key={t.tag} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                  <span className="flex-1 truncate text-foreground/80" title={t.tag}>{t.tag}</span>
                  <span className="text-muted-foreground tabular-nums">{t.count}</span>
                  <span className="text-muted-foreground/60 tabular-nums w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 难度分布 */}
      <div className="card p-5 md:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground">题目难度分布</div>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            {(["cf", "atc", "nc"] as Platform[]).map(p => (
              <span key={p} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: PLATFORM_COLOR[p] }} />
                {PLATFORM_LABEL[p]}
              </span>
            ))}
          </div>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={difficulty} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<DifficultyTooltip />} cursor={{ fill: "var(--surface-bg)" }} />
              <Bar dataKey="cf" stackId="d" fill={PLATFORM_COLOR.cf} />
              <Bar dataKey="atc" stackId="d" fill={PLATFORM_COLOR.atc} />
              <Bar dataKey="nc" stackId="d" fill={PLATFORM_COLOR.nc} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StreakStat({ label, value, unit, accent }: { label: string; value: number; unit: string; accent: string }) {
  return (
    <div className="surface px-3 py-2.5 rounded-lg">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>{value}</span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
