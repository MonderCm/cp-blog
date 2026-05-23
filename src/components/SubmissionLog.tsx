"use client";

import { useMemo, useState } from "react";

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
}

export default function SubmissionLog({
  cfSubmissions,
  atcSubmissions,
}: SubmissionLogProps) {
  const [filter, setFilter] = useState<"all" | "cf" | "atc">("all");
  const [visibleDays, setVisibleDays] = useState(14);

  const all: (Problem & { platform: string; date: string })[] = [];

  for (const d of cfSubmissions) {
    for (const p of d.problems) {
      all.push({ ...p, platform: "CF", date: d.date });
    }
  }
  for (const d of atcSubmissions) {
    for (const p of d.problems) {
      all.push({ ...p, platform: "AtC", date: d.date });
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return all;
    return all.filter((s) =>
      filter === "cf" ? s.platform === "CF" : s.platform === "AtC"
    );
  }, [all, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, (Problem & { platform: string })[]> = {};
    for (const s of filtered) {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, visibleDays);
  }, [filtered, visibleDays]);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
          {(["all", "cf", "atc"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                filter === f
                  ? "bg-white/[0.1] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "全部" : f === "cf" ? "Codeforces" : "AtCoder"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map(([date, subs]) => {
          const dateObj = new Date(date + "T00:00:00");
          const dayLabel = dateObj.toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "short",
          });

          return (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-xs text-muted-foreground">
                  {dateObj.getDate()}
                </div>
                <span className="text-sm text-muted-foreground">{dayLabel}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground">
                  {subs.length} 题
                </span>
              </div>

              <div className="ml-11 space-y-2">
                {subs.map((sub, idx) => {
                  const platColor =
                    sub.platform === "CF" ? "#818cf8" : "#34d399";
                  const isAC = sub.verdict === "AC";

                  return (
                    <a
                      key={`${sub.platform}-${sub.id}-${idx}`}
                      href={sub.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.03] hover:border-white/[0.08] transition-all group"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${platColor}18`, color: platColor }}
                        >
                          {sub.platform}
                        </span>

                        <span className="text-sm font-medium group-hover:text-indigo-400 transition-colors truncate max-w-[300px]">
                          {sub.id} {sub.name}
                        </span>

                        <div className="flex gap-1 flex-wrap">
                          {sub.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-white/[0.06] text-muted-foreground">
                          {sub.score}
                        </span>

                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ml-auto ${
                            isAC
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          {sub.verdict}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            暂无做题记录
          </div>
        )}
      </div>

      {all.length > visibleDays * 3 && (
        <button
          onClick={() => setVisibleDays((prev) => prev + 14)}
          className="w-full mt-6 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/[0.03] transition-colors"
        >
          加载更多
        </button>
      )}
    </div>
  );
}