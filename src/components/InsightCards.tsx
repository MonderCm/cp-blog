"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
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

/* ---------- D1: 难度分布(CF Practice 的 Solve Count By Ratings 样式) ---------- */

interface DifficultyRow {
  bucket: number;   // 桶下界,如 800、900
  solved: number;   // AC 过的题
  attempted: number; // 交过但从未 AC 的题
}

/* CF 段位色,按桶难度上色(与官网 rating graph 一致) */
function getBucketColor(r: number): string {
  if (r < 1200) return "#aaaaaa";
  if (r < 1400) return "#77dd77";
  if (r < 1600) return "#77ddbb";
  if (r < 1900) return "#7799ff";
  if (r < 2100) return "#cc88ff";
  if (r < 2300) return "#ffcc88";
  if (r < 2400) return "#ffbb55";
  if (r < 2600) return "#ff7777";
  if (r < 3000) return "#ff3333";
  return "#aa0000";
}

const ATTEMPTED_COLOR = "#f9c4d0";

function buildDifficulty(subs: PlatformBuckets<SubmissionDay[]>): DifficultyRow[] {
  // 先按题目聚合:一题只算一次,任意一次 AC 即 Solved,否则 Attempted
  const status = new Map<string, { score: number; solved: boolean }>();
  for (const platform of ["cf", "atc", "nc"] as Platform[]) {
    for (const day of subs[platform] || []) {
      for (const p of day.problems) {
        const score = p.score || 0;
        if (score <= 0) continue;
        const key = `${platform}#${p.id}`;
        const cur = status.get(key) || { score, solved: false };
        if (p.verdict === "AC" || p.verdict === "OK") cur.solved = true;
        status.set(key, cur);
      }
    }
  }
  if (status.size === 0) return [];

  // 100 分一桶,范围取数据实际跨度(整百对齐)
  const counter = new Map<number, { solved: number; attempted: number }>();
  for (const { score, solved } of status.values()) {
    const b = Math.floor(score / 100) * 100;
    const c = counter.get(b) || { solved: 0, attempted: 0 };
    if (solved) c.solved++; else c.attempted++;
    counter.set(b, c);
  }
  const buckets = Array.from(counter.keys());
  const lo = Math.min(...buckets), hi = Math.max(...buckets);
  const rows: DifficultyRow[] = [];
  for (let b = lo; b <= hi; b += 100) {
    const c = counter.get(b);
    rows.push({ bucket: b, solved: c?.solved ?? 0, attempted: c?.attempted ?? 0 });
  }
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
  const solved = Number(payload.find(e => e.dataKey === "solved")?.value ?? 0);
  const attempted = Number(payload.find(e => e.dataKey === "attempted")?.value ?? 0);
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg text-xs" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="text-muted-foreground mb-1">难度 {label}</div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-sm" style={{ background: getBucketColor(Number(label)) }} />
        <span className="text-foreground/80">Solved</span>
        <span className="ml-auto tabular-nums font-semibold text-foreground">{solved}</span>
      </div>
      {attempted > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ background: ATTEMPTED_COLOR }} />
          <span className="text-foreground/80">Attempted</span>
          <span className="ml-auto tabular-nums text-foreground">{attempted}</span>
        </div>
      )}
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

      {/* 难度分布(CF Practice 样式:100 分一桶,桶色随段位,Attempted 粉色叠顶) */}
      <div className="card p-5 md:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground">题目难度分布</div>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#aaaaaa" }} />
              Solved
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: ATTEMPTED_COLOR }} />
              Attempted
            </span>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={difficulty} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis
                dataKey="bucket"
                interval={0}
                tick={{ fontSize: 9, fill: "#71717a" }}
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
              <Bar dataKey="solved" stackId="d" isAnimationActive={false}>
                {difficulty.map(row => (
                  <Cell key={row.bucket} fill={getBucketColor(row.bucket)} />
                ))}
              </Bar>
              <Bar dataKey="attempted" stackId="d" fill={ATTEMPTED_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
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
