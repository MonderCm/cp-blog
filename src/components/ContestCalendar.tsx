"use client";

import { useState, useEffect } from "react";

interface Contest {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: "Codeforces" | "AtCoder";
  url: string;
}

interface ContestCalendarProps {
  cfContests: Contest[];
  atcContests: Contest[];
}

function Countdown({ target }: { target: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const targetTime = new Date(target).getTime();
      const diff = targetTime - now;
      if (diff <= 0) { setText("进行中"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0) setText(`${d}天${h}小时`);
      else if (h > 0) setText(`${h}小时${m}分钟`);
      else setText(`${m}分钟`);
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span className="text-sm font-mono tabular-nums text-indigo-400">
      {text}
    </span>
  );
}

export default function ContestCalendar({
  cfContests,
  atcContests,
}: ContestCalendarProps) {
  const contests = [...cfContests, ...atcContests]
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
    .slice(0, 6);

  if (contests.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted-foreground">
        暂无即将举办的比赛
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="space-y-3">
        {contests.map((c) => {
          const dateObj = new Date(`${c.date}T${c.time}`);
          const platformColor = c.platform === "Codeforces" ? "#818cf8" : "#34d399";

          return (
            <a
              key={`${c.platform}-${c.name}`}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: platformColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{c.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground shrink-0">
                    {c.platform}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {dateObj.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}{" "}
                  {dateObj.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{" "}
                  · {c.duration}
                </div>
              </div>
              <div className="shrink-0">
                <Countdown target={`${c.date}T${c.time}`} />
              </div>
              <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                &rarr;
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}