"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RatingCardProps {
  platform: string;
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
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

export default function RatingCard({
  platform,
  handle,
  rating,
  rank,
  maxRating,
  maxRank,
  history,
}: RatingCardProps) {
  const isCF = platform === "Codeforces";
  const hex = isCF ? getCFColor(rating) : getATCColor(rating);
  const accentColor = isCF ? "#818cf8" : "#34d399";

  const chartData = history.map((h) => ({
    date: h.date.slice(5),
    rating: h.rating,
  }));

  return (
    <div className="glass-card p-5 relative overflow-hidden group hover:border-white/[0.12] transition-colors">
      <div
        className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-15"
        style={{ background: hex }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: accentColor }}>
              {platform}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              @{handle}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ color: hex, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {rating}
          </span>
          <span className="text-sm font-medium" style={{ color: hex }}>
            {rank}
          </span>
        </div>

        <div className="text-xs text-muted-foreground mb-4">
          最高 {maxRating}（{maxRank}）
        </div>

        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`rating-${platform}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hex} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={hex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  padding: "4px 8px",
                }}
                labelStyle={{ color: "#a1a1aa", fontSize: "10px" }}
              />
              <Area
                type="monotone"
                dataKey="rating"
                stroke={hex}
                strokeWidth={1.5}
                fill={`url(#rating-${platform})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}