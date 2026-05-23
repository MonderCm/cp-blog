"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import RatingCard from "@/components/RatingCard";
import ContestCalendar from "@/components/ContestCalendar";
import SubmissionLog from "@/components/SubmissionLog";
import Heatmap from "@/components/Heatmap";
import SettingsModal from "@/components/SettingsModal";

/* ========== 类型 ========== */

export interface RatingData {
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

export interface ProblemEntry {
  id: string;
  name: string;
  url: string;
  tags: string[];
  score: number;
  time: string;
  language: string;
  verdict: string;
}

export interface SubmissionDay {
  date: string;
  problems: ProblemEntry[];
}

export interface Contest {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: "Codeforces" | "AtCoder";
  url: string;
}

interface ProfileData {
  avatar: string;
  name: string;
  bio: string;
  signature: string;
  location: string;
  cfUsername: string;
  atcUsername: string;
}

interface Props {
  profile: ProfileData;
  cfRating: RatingData;
  atcRating: RatingData;
  cfSubmissions: SubmissionDay[];
  atcSubmissions: SubmissionDay[];
  cfContests: Contest[];
  atcContests: Contest[];
  heatmapData: Record<string, string[]>;
}

/* ========== localStorage 持久化 ========== */

const STORAGE_KEY = "cp-blog-profile";

function loadProfile(fallback: ProfileData): ProfileData {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...fallback, ...saved };
    }
  } catch { /* ignore parse errors */ }
  return fallback;
}

function saveProfile(data: ProfileData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/* ========== API 工具 ========== */

async function fetchCFRating(username: string): Promise<RatingData> {
  const resp = await fetch(
    `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`,
  );
  const data = await resp.json();
  if (data.status !== "OK" || !data.result?.length) {
    throw new Error("CF 用户不存在");
  }
  const u = data.result[0];

  // Rating history
  let history: { date: string; rating: number }[] = [];
  try {
    const histResp = await fetch(
      `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(username)}`,
    );
    const histData = await histResp.json();
    if (histData.status === "OK") {
      const monthly: Record<string, number> = {};
      for (const item of histData.result) {
        const d = new Date(item.ratingUpdateTimeSeconds * 1000)
          .toISOString()
          .slice(0, 7);
        if (!monthly[d] || item.newRating > monthly[d]) monthly[d] = item.newRating;
      }
      history = Object.entries(monthly)
        .map(([date, rating]) => ({ date, rating }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-6);
    }
  } catch { /* ignore history errors */ }

  return {
    handle: u.handle,
    rating: u.rating ?? 0,
    rank: u.rank ?? "unrated",
    maxRating: u.maxRating ?? 0,
    maxRank: u.maxRank ?? "unrated",
    history,
  };
}

async function fetchAtcRating(username: string): Promise<RatingData> {
  const resp = await fetch(`/api/atcoder?username=${encodeURIComponent(username)}&type=rating`);
  if (!resp.ok) throw new Error("AtC 获取失败");
  return resp.json();
}

/* ========== 组件 ========== */

export default function HomePageClient({
  profile: initialProfile,
  cfRating: initialCFRating,
  atcRating: initialAtcRating,
  cfSubmissions,
  atcSubmissions,
  cfContests: initialCFContests,
  atcContests: initialAtcContests,
  heatmapData,
}: Props) {
  const [profile, setProfile] = useState(() => loadProfile(initialProfile));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 可动态刷新的数据
  const [cfRating, setCFRating] = useState(initialCFRating);
  const [atcRating, setAtcRating] = useState(initialAtcRating);
  const [cfContests, setCFContests] = useState(initialCFContests);
  const [atcContests, setAtcContests] = useState(initialAtcContests);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleSave = useCallback(
    async (data: ProfileData) => {
      const merged = { ...profile, ...data };
      setProfile(merged);
      saveProfile(merged);

      // handle 变更时重新拉取数据
      const cfChanged = data.cfUsername && data.cfUsername !== profile.cfUsername;
      const atcChanged = data.atcUsername && data.atcUsername !== profile.atcUsername;

      if (cfChanged || atcChanged) {
        setFetching(true);
        setFetchError("");
        try {
          const tasks: Promise<void>[] = [];
          if (cfChanged) {
            tasks.push(
              fetchCFRating(data.cfUsername).then(setCFRating).catch((e) => {
                setFetchError((prev) => prev + "CF: " + e.message + " ");
              }),
            );
          }
          if (atcChanged) {
            tasks.push(
              fetchAtcRating(data.atcUsername).then(setAtcRating).catch((e) => {
                setFetchError((prev) => prev + "AtC: " + e.message + " ");
              }),
            );
          }
          await Promise.allSettled(tasks);

          // 刷新比赛日历
          try {
            const cfResp = await fetch("https://codeforces.com/api/contest.list");
            const cfData = await cfResp.json();
            if (cfData.status === "OK") {
              const upcoming = cfData.result
                .filter((c: { phase: string }) => c.phase === "BEFORE")
                .slice(0, 5)
                .map((c: { name: string; startTimeSeconds: number; durationSeconds: number; id: number }) => ({
                  name: c.name,
                  date: new Date(c.startTimeSeconds * 1000).toISOString().slice(0, 10),
                  time: new Date(c.startTimeSeconds * 1000).toTimeString().slice(0, 5),
                  duration: `${Math.floor(c.durationSeconds / 3600)}:${String(Math.floor((c.durationSeconds % 3600) / 60)).padStart(2, "0")}`,
                  platform: "Codeforces" as const,
                  url: `https://codeforces.com/contests/${c.id}`,
                }));
              setCFContests(upcoming);
            }
          } catch { /* ignore */ }

          try {
            const atcResp = await fetch(
              `/api/atcoder?username=${data.atcUsername || profile.atcUsername}&type=contests`,
            );
            if (atcResp.ok) {
              const atcData = await atcResp.json();
              setAtcContests(atcData);
            }
          } catch { /* ignore */ }
        } finally {
          setFetching(false);
        }
      }
    },
    [profile],
  );

  return (
    <>
      <Navbar signature={profile.signature} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ---- GitHub 风格头部 ---- */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* 左侧：头像 + 信息 */}
          <div className="flex-shrink-0 flex flex-col items-center md:items-start">
            <div className="relative mb-3">
              <div className="w-72 h-72 md:w-64 md:h-64 rounded-full overflow-hidden ring-[3px] ring-white/[0.08] shadow-lg shadow-indigo-500/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profile.avatar}
                  alt="头像"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full border-[3px] border-background bg-emerald-500/20 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>

            <h1 className="text-2xl font-semibold mb-1">{profile.name}</h1>
            <p className="text-muted-foreground text-sm mb-4">{profile.bio}</p>

            <p className="text-muted-foreground text-xs flex items-center gap-1.5 mb-4">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6zm0 8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
              </svg>
              {profile.location}
            </p>

            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full px-4 py-1.5 text-sm rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] transition-colors"
            >
              编辑资料
            </button>
          </div>

          {/* 右侧：Rating 卡片 */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {fetching && (
              <div className="text-xs text-muted-foreground flex items-center gap-2 px-1">
                <span className="inline-block w-3 h-3 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                正在获取最新数据...
              </div>
            )}
            {fetchError && (
              <div className="text-xs text-red-400/80 px-1">{fetchError}</div>
            )}
            <RatingCard
              platform="Codeforces"
              handle={profile.cfUsername}
              rating={cfRating.rating}
              rank={cfRating.rank}
              maxRating={cfRating.maxRating}
              maxRank={cfRating.maxRank}
              history={cfRating.history}
            />
            <RatingCard
              platform="AtCoder"
              handle={profile.atcUsername}
              rating={atcRating.rating}
              rank={atcRating.rank}
              maxRating={atcRating.maxRating}
              maxRank={atcRating.maxRank}
              history={atcRating.history}
            />
          </div>
        </div>

        {/* ---- 比赛日历 ---- */}
        <section className="mb-10">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground">
              <path d="M4 1.5a.5.5 0 0 1 .5.5v1h7v-1a.5.5 0 0 1 1 0v1h1.5A1.5 1.5 0 0 1 15.5 4.5v9a1.5 1.5 0 0 1-1.5 1.5H2A1.5 1.5 0 0 1 .5 13.5v-9A1.5 1.5 0 0 1 2 3h1.5v-1a.5.5 0 0 1 .5-.5zM2 4a.5.5 0 0 0-.5.5V6h13V4.5A.5.5 0 0 0 14 4H2zm-.5 3v6.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V7h-14z" />
            </svg>
            即将举办的比赛
          </h2>
          <ContestCalendar cfContests={cfContests} atcContests={atcContests} />
        </section>

        {/* ---- 热力图 ---- */}
        <section className="mb-10">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V1.5h-8a1 1 0 0 0-1 1v6.708A2.5 2.5 0 0 1 4.5 9h3.25a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0 0 2h3.25a.75.75 0 0 1 0 1.5H4.5A2.5 2.5 0 0 1 2 11.5v-9zM14.5 9a2.5 2.5 0 0 0-2.5-2.5H7.75a.75.75 0 0 0 0 1.5H12a1 1 0 0 1 0 2H9.75a.75.75 0 0 0 0 1.5H12a1 1 0 0 1 0 2H7.75a.75.75 0 0 0 0 1.5H12a2.5 2.5 0 0 0 2.5-2.5V9z" />
            </svg>
            刷题热力图
          </h2>
          <div className="glass-card p-4 sm:p-6">
            <Heatmap submissions={heatmapData} />
          </div>
        </section>

        {/* ---- 做题日志 ---- */}
        <section>
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground">
              <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75V1.75zm8.755 3a2.25 2.25 0 0 1 2.25-2.25H14.5v9h-3.757c-.71 0-1.4.201-1.992.572l.004-7.322zm-1.504 7.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574z" />
            </svg>
            刷题日志
          </h2>
          <SubmissionLog cfSubmissions={cfSubmissions} atcSubmissions={atcSubmissions} />
        </section>
      </div>

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        onSave={handleSave}
      />
    </>
  );
}