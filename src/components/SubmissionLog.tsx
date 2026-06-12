"use client";

import { useMemo, useState, useEffect, useRef } from "react";

function formatDate(dateStr: string): { dayNum: number; label: string } {
  const dateObj = new Date(dateStr + "T00:00:00");
  const dayNum = dateObj.getDate();
  const weekdays = ["周日","周一","周二","周三","周四","周五","周六"];
  const label = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dayNum}日 ${weekdays[dateObj.getDay()]}`;
  return { dayNum, label };
}

interface Problem {
  id: string;
  name: string;
  url: string;
  tags: string[];
  score: number;
  time: string;
  language: string;
  verdict: string;
}

interface DayEntry {
  date: string;
  problems: Problem[];
}

interface SubmissionLogProps {
  cfSubmissions: DayEntry[];
  atcSubmissions: DayEntry[];
  ncSubmissions: DayEntry[];
}

/** 把原始 verdict 归一化成 AC / TLE / WA / RE / MLE / CE / PE / OLE / 其他短码 */
function normalizeVerdict(v: string): { short: string; isAC: boolean } {
  const upper = (v || "").toUpperCase();
  if (upper === "OK" || upper === "AC" || upper === "ACCEPTED") return { short: "AC", isAC: true };
  if (upper.includes("TIME") || upper === "TLE") return { short: "TLE", isAC: false };
  if (upper.includes("WRONG") || upper === "WA") return { short: "WA", isAC: false };
  if (upper.includes("RUNTIME") || upper === "RE") return { short: "RE", isAC: false };
  if (upper.includes("MEMORY") || upper === "MLE") return { short: "MLE", isAC: false };
  if (upper.includes("COMPIL") || upper === "CE") return { short: "CE", isAC: false };
  if (upper.includes("PRESENT") || upper === "PE") return { short: "PE", isAC: false };
  if (upper.includes("OUTPUT") || upper === "OLE") return { short: "OLE", isAC: false };
  if (upper.includes("PARTIAL")) return { short: "PARTIAL", isAC: false };
  if (upper.includes("SKIP")) return { short: "SKIP", isAC: false };
  if (upper.includes("REJECT")) return { short: "REJ", isAC: false };
  if (upper.includes("FAIL")) return { short: "FAIL", isAC: false };
  if (upper.includes("CHALL")) return { short: "HACKED", isAC: false };
  if (upper.includes("IDLE")) return { short: "IL", isAC: false };
  // 兜底:取前 3-4 个字母大写
  return { short: upper.slice(0, 4) || "?", isAC: false };
}

const VERDICT_COLOR: Record<string, { bg: string; text: string }> = {
  AC: { bg: "rgba(16,185,129,0.12)", text: "#059669" },        // 绿
  TLE: { bg: "rgba(245,158,11,0.12)", text: "#d97706" },        // 琥珀
  WA: { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },          // 红
  RE: { bg: "rgba(168,85,247,0.12)", text: "#9333ea" },         // 紫
  MLE: { bg: "rgba(236,72,153,0.12)", text: "#db2777" },        // 粉
  CE: { bg: "rgba(99,102,241,0.12)", text: "#4f46e5" },         // 靛
  PE: { bg: "rgba(20,184,166,0.12)", text: "#0d9488" },         // 青
  OLE: { bg: "rgba(234,88,12,0.12)", text: "#ea580c" },         // 橙
  HACKED: { bg: "rgba(220,38,38,0.18)", text: "#b91c1c" },
};

function verdictStyle(short: string) {
  return VERDICT_COLOR[short] || { bg: "rgba(115,115,115,0.12)", text: "#525252" };
}

export default function SubmissionLog({
  cfSubmissions,
  atcSubmissions,
  ncSubmissions,
}: SubmissionLogProps) {
  const [filter, setFilter] = useState<"all" | "cf" | "atc" | "nc">("all");
  const [visibleDays, setVisibleDays] = useState(14);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => {
    const entries: (Problem & { platform: string; date: string })[] = [];
    for (const d of cfSubmissions) {
      for (const p of d.problems) entries.push({ ...p, platform: "CF", date: d.date });
    }
    for (const d of atcSubmissions) {
      for (const p of d.problems) entries.push({ ...p, platform: "AtC", date: d.date });
    }
    for (const d of ncSubmissions) {
      for (const p of d.problems) entries.push({ ...p, platform: "NC", date: d.date });
    }
    return entries;
  }, [cfSubmissions, atcSubmissions, ncSubmissions]);

  /** 同一道题去重:同 platform+id 只保留一条;优先 AC,其次最新 */
  const dedup = useMemo(() => {
    const map = new Map<string, Problem & { platform: string; date: string }>();
    for (const s of all) {
      const key = `${s.platform}#${s.id}`;
      const existing = map.get(key);
      if (!existing) { map.set(key, s); continue; }
      const newIsAC = normalizeVerdict(s.verdict).isAC;
      const oldIsAC = normalizeVerdict(existing.verdict).isAC;
      // 已经记下 AC 的就不动;新的是 AC 而旧的不是 → 替换
      if (oldIsAC && !newIsAC) continue;
      if (!oldIsAC && newIsAC) { map.set(key, s); continue; }
      // 同状态比时间(date + time),取更新的
      const oldKey = `${existing.date}T${existing.time || "00:00"}`;
      const newKey = `${s.date}T${s.time || "00:00"}`;
      if (newKey > oldKey) map.set(key, s);
    }
    return Array.from(map.values());
  }, [all]);

  const filtered = useMemo(() => {
    if (filter === "all") return dedup;
    return dedup.filter((s) => {
      if (filter === "cf") return s.platform === "CF";
      if (filter === "atc") return s.platform === "AtC";
      return s.platform === "NC";
    });
  }, [dedup, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, (Problem & { platform: string })[]> = {};
    for (const s of filtered) {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const visibleGrouped = grouped.slice(0, visibleDays);
  const hasMore = grouped.length > visibleDays;

  // 无限滚动：sentinel 进入视口时自动加载更多
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const ro = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleDays((prev) => prev + 14);
    }, { rootMargin: "300px" });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasMore]);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-black/[0.04] rounded-lg p-1">
          {(["all", "cf", "atc", "nc"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                filter === f
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "全部" : f === "cf" ? "Codeforces" : f === "atc" ? "AtCoder" : "牛客网"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {visibleGrouped.map(([date, subs]) => {
          const { dayNum, label } = formatDate(date);

          return (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center text-xs text-muted-foreground">
                  {dayNum}
                </div>
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-black/[0.04] text-muted-foreground">
                  {subs.length} 题
                </span>
              </div>

              <div className="ml-11 space-y-2">
                {subs.map((sub, idx) => {
                  const platColor =
                    sub.platform === "CF" ? "#6366f1" : sub.platform === "AtC" ? "#10b981" : "#f59e0b";
                  const v = normalizeVerdict(sub.verdict);
                  const vs = verdictStyle(v.short);

                  return (
                    <a
                      key={`${sub.platform}-${sub.id}-${idx}`}
                      href={sub.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg bg-black/[0.02] hover:bg-black/[0.04] border border-black/[0.04] hover:border-black/[0.08] transition-all group"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${platColor}18`, color: platColor }}
                        >
                          {sub.platform}
                        </span>

                        <span className="text-sm font-medium group-hover:text-indigo-500 transition-colors truncate max-w-[300px]">
                          {sub.id} {sub.name}
                        </span>

                        {sub.score > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-black/[0.04] text-muted-foreground">
                            {sub.score}
                          </span>
                        )}

                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono ml-auto font-bold"
                          style={{ background: vs.bg, color: vs.text }}
                        >
                          {v.short}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}

        {visibleGrouped.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            暂无做题记录
          </div>
        )}
      </div>

      {/* 无限滚动 sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <span className="inline-block w-4 h-4 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
