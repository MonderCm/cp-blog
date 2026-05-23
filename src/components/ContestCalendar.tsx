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

const REG_STORAGE_KEY = "cp-blog-contest-reg";
type RegMap = Record<string, boolean>;

function loadRegistrations(): RegMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(REG_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveRegistrations(map: RegMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(map));
}

function Countdown({ target }: { target: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const targetTime = new Date(target).getTime();
      const diff = targetTime - now;
      if (diff <= 0) {
        setText("进行中");
        return;
      }
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
    <span className="text-sm font-mono tabular-nums text-indigo-400">{text}</span>
  );
}

function ContestCard({
  contest,
  cid,
  registered,
  onToggle,
}: {
  contest: Contest;
  cid: string;
  registered: boolean;
  onToggle: (cid: string) => void;
}) {
  const dateObj = new Date(`${contest.date}T${contest.time}`);
  const platformColor =
    contest.platform === "Codeforces" ? "#818cf8" : "#34d399";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: platformColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{contest.name}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {dateObj.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}{" "}
          {dateObj.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{" "}
          · {contest.duration}
        </div>
      </div>
      <div className="shrink-0">
        <Countdown target={`${contest.date}T${contest.time}`} />
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          onToggle(cid);
        }}
        className={`shrink-0 px-3 py-1 text-xs rounded-full transition-colors ${
          registered
            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
            : "bg-white/[0.04] text-muted-foreground border border-white/[0.06] hover:border-indigo-500/30 hover:text-indigo-300"
        }`}
      >
        {registered ? "已报名" : "未报名"}
      </button>
      <a
        href={contest.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-sm shrink-0"
      >
        &rarr;
      </a>
    </div>
  );
}

function ContestSection({
  title,
  icon,
  color,
  contests,
  regMap,
  onToggleReg,
}: {
  title: string;
  icon: string;
  color: string;
  contests: Contest[];
  regMap: RegMap;
  onToggleReg: (cid: string) => void;
}) {
  const registered = contests.filter((c) => regMap[`${c.platform}-${c.name}`]);
  const unregistered = contests.filter((c) => !regMap[`${c.platform}-${c.name}`]);
  const sorted = [...registered, ...unregistered];

  if (contests.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-semibold" style={{ color }}>
            {title}
          </h3>
          <span className="text-xs text-muted-foreground">暂无比赛</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color }}>
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {contests.length} 场
        </span>
      </div>
      <div className="space-y-1">
        {sorted.map((c) => {
          const cid = `${c.platform}-${c.name}`;
          return (
            <ContestCard
              key={cid}
              contest={c}
              cid={cid}
              registered={!!regMap[cid]}
              onToggle={onToggleReg}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ContestCalendar({
  cfContests,
  atcContests,
}: ContestCalendarProps) {
  const [regMap, setRegMap] = useState<RegMap>({});

  useEffect(() => {
    setRegMap(loadRegistrations());
  }, []);

  const handleToggle = (cid: string) => {
    setRegMap((prev) => {
      const next = { ...prev, [cid]: !prev[cid] };
      saveRegistrations(next);
      return next;
    });
  };

  const total = cfContests.length + atcContests.length;
  if (total === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted-foreground">
        暂无即将举办的比赛
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">即将举办的比赛</h2>
        <span className="text-xs text-muted-foreground">{total} 场</span>
      </div>
      <div className="space-y-6">
        <ContestSection
          title="Codeforces"
          icon="🔵"
          color="#818cf8"
          contests={cfContests}
          regMap={regMap}
          onToggleReg={handleToggle}
        />
        <ContestSection
          title="AtCoder"
          icon="🟢"
          color="#34d399"
          contests={atcContests}
          regMap={regMap}
          onToggleReg={handleToggle}
        />
      </div>
    </div>
  );
}