"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ContestCalendar from "@/components/ContestCalendar";
import ColorfulSignature from "@/components/ColorfulSignature";
import SubmissionLog from "@/components/SubmissionLog";
import SettingsModal from "@/components/SettingsModal";
import InsightCards from "@/components/InsightCards";
import ThemeToggle from "@/components/ThemeToggle";
import type { HeatmapProblem } from "@/components/Heatmap";
import type { RatingData, SubmissionDay, PlatformBuckets } from "@/lib/types";
import type { CFContestHistoryEntry } from "@/lib/cf-api";
import type { AtCContestHistoryEntry } from "@/lib/atc-api";
import type { NCContestHistoryEntry } from "@/lib/nc-api";
import type { UserProfile } from "@/lib/profile";

export type { RatingData, ProblemEntry, SubmissionDay } from "@/lib/types";

// recharts 体积较大 + 依赖 ResizeObserver,延迟到客户端
const RatingCard = dynamic(() => import("@/components/RatingCard"), {
  ssr: false,
  loading: () => (
    <div className="card p-5 animate-pulse">
      <div className="h-4 w-20 rounded mb-3" style={{ background: "var(--surface-bg)" }} />
      <div className="h-9 w-32 rounded mb-1" style={{ background: "var(--surface-bg)" }} />
      <div className="h-3 w-24 rounded mb-4" style={{ background: "var(--surface-bg)" }} />
      <div className="h-24 rounded" style={{ background: "var(--surface-bg)" }} />
    </div>
  ),
});

/* ========== 类型 ========== */

export interface Contest {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: "Codeforces" | "AtCoder" | "牛客网";
  url: string;
}

interface Props {
  profile: UserProfile;
}

/* ========== localStorage 持久化(按 slug 分键,多用户互不污染) ========== */

const STORAGE_VERSION_KEY = "cp-blog-cache-version";
const CACHE_VERSION = "v5"; // v5:加入多用户隔离

const k = (slug: string, suffix: string) => `cp-blog:${slug}:${suffix}`;

type Section = "home" | "submissions" | "contests";

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function safeGetString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSetString(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** 客户端挂载后调用:版本不匹配清掉所有旧缓存 */
function ensureCacheVersion(): boolean {
  if (typeof window === "undefined") return false;
  const saved = safeGetString(STORAGE_VERSION_KEY);
  if (saved !== CACHE_VERSION) {
    try {
      // v4 及更早是全局键,v5 后按 slug 分键
      const stale = ["cp-blog-rating", "cp-blog-submissions", "cp-blog-submissions-v2", "cp-blog-profile", "cp-blog-active-section"];
      for (const key of stale) localStorage.removeItem(key);
    } catch { /* ignore */ }
    safeSetString(STORAGE_VERSION_KEY, CACHE_VERSION);
    return true;
  }
  return false;
}

function defaultRating(handle: string): RatingData {
  return { handle, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
}

function emptyBuckets(): PlatformBuckets<SubmissionDay[]> {
  return { cf: [], atc: [], nc: [] };
}

function buildHeatmap(buckets: PlatformBuckets<SubmissionDay[]>): Record<string, HeatmapProblem[]> {
  const byDate = new Map<string, Map<string, HeatmapProblem>>();
  for (const day of [...buckets.cf, ...buckets.atc, ...buckets.nc]) {
    if (!day.problems.length) continue;
    let bucket = byDate.get(day.date);
    if (!bucket) { bucket = new Map(); byDate.set(day.date, bucket); }
    for (const p of day.problems) {
      if (p.verdict !== "AC" && p.verdict !== "OK") continue;
      if (!bucket.has(p.id)) bucket.set(p.id, { id: p.id, name: p.name, url: p.url, score: p.score });
    }
  }
  const result: Record<string, HeatmapProblem[]> = {};
  for (const [date, m] of byDate) result[date] = Array.from(m.values());
  return result;
}

/* ========== API ========== */

async function fetchUserData(slug: string, force = false) {
  const url = `/api/user?slug=${encodeURIComponent(slug)}${force ? "&refresh=1" : ""}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("获取用户数据失败");
  return resp.json() as Promise<{ cf: RatingData; atc: RatingData; nc: RatingData; cfContestHistory: CFContestHistoryEntry[]; atcContestHistory: AtCContestHistoryEntry[]; ncContestHistory: NCContestHistoryEntry[]; cached: boolean }>;
}

async function fetchSubmissions(slug: string, force = false): Promise<PlatformBuckets<SubmissionDay[]> & { cached?: boolean }> {
  const url = `/api/submissions?slug=${encodeURIComponent(slug)}${force ? "&refresh=1" : ""}`;
  const resp = await fetch(url);
  if (!resp.ok) return emptyBuckets();
  return resp.json();
}

async function fetchContests(): Promise<PlatformBuckets<Contest[]>> {
  const resp = await fetch("/api/contests");
  if (!resp.ok) return { cf: [], atc: [], nc: [] };
  return resp.json();
}

/* ========== 组件 ========== */

export default function HomePageClient({ profile: initialProfile }: Props) {
  const router = useRouter();
  const slug = initialProfile.slug;

  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [cfRating, setCFRating] = useState<RatingData>(defaultRating(initialProfile.cfHandle));
  const [atcRating, setAtcRating] = useState<RatingData>(defaultRating(initialProfile.atcHandle));
  const [ncRating, setNCRating] = useState<RatingData>(defaultRating(initialProfile.ncHandle));

  const [subs, setSubs] = useState<PlatformBuckets<SubmissionDay[]>>(emptyBuckets());
  const [contests, setContests] = useState<PlatformBuckets<Contest[]>>({ cf: [], atc: [], nc: [] });
  const [heatmapData, setHeatmapData] = useState<Record<string, HeatmapProblem[]>>({});
  const [cfContestHistory, setCFContestHistory] = useState<CFContestHistoryEntry[]>([]);
  const [atcContestHistory, setAtCContestHistory] = useState<AtCContestHistoryEntry[]>([]);
  const [ncContestHistory, setNCContestHistory] = useState<NCContestHistoryEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("home");

  const mountedRef = useRef(false);

  const refreshAll = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    setFetching(true);
    setFetchError("");

    const [userResult, subsResult, contestsResult] = await Promise.allSettled([
      fetchUserData(slug, force),
      fetchSubmissions(slug, force),
      fetchContests(),
    ]);

    if (userResult.status === "fulfilled") {
      const v = userResult.value;
      setCFRating(v.cf); setAtcRating(v.atc); setNCRating(v.nc);
      if (v.cfContestHistory) setCFContestHistory(v.cfContestHistory);
      if (v.atcContestHistory) setAtCContestHistory(v.atcContestHistory);
      if (v.ncContestHistory) setNCContestHistory(v.ncContestHistory);
      safeSet(k(slug, "rating"), { cf: v.cf, atc: v.atc, nc: v.nc });
    }

    if (subsResult.status === "fulfilled") {
      const data = subsResult.value;
      const buckets: PlatformBuckets<SubmissionDay[]> = { cf: data.cf, atc: data.atc, nc: data.nc };
      const hasAny = buckets.cf.length || buckets.atc.length || buckets.nc.length;
      if (hasAny) {
        setSubs(buckets);
        safeSet(k(slug, "subs"), buckets);
        setHeatmapData(buildHeatmap(buckets));
      } else {
        setFetchError("暂无提交记录,设置三平台账号或等待 cron 抓取");
      }
    }

    if (contestsResult.status === "fulfilled") {
      setContests(contestsResult.value);
    }

    const errors = [
      userResult.status === "rejected" && `用户数据(${userResult.reason})`,
      subsResult.status === "rejected" && `提交记录(${subsResult.reason})`,
      contestsResult.status === "rejected" && `比赛(${contestsResult.reason})`,
    ].filter(Boolean);
    const statuses = [
      userResult.status === "fulfilled" && "用户数据",
      subsResult.status === "fulfilled" && "提交记录",
      contestsResult.status === "fulfilled" && "比赛",
    ].filter(Boolean);
    if (errors.length > 0) {
      setFetchError(`${statuses.join("、")}已加载；${errors.join("；")} 失败`);
    }

    setFetching(false);
  }, [slug]);

  // 挂载:版本检查 → 读 localStorage → 拉远程
  // 这里 setState-in-effect 是有意的一次性 hydration,
  // 等同于 useSyncExternalStore 的浏览器侧 lazy read,功能正确
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const cleared = ensureCacheVersion();

    if (!cleared) {
      const savedRating = safeGet<{ cf?: RatingData; atc?: RatingData; nc?: RatingData }>(k(slug, "rating"));
      if (savedRating) {
        if (savedRating.cf) setCFRating(savedRating.cf);
        if (savedRating.atc) setAtcRating(savedRating.atc);
        if (savedRating.nc) setNCRating(savedRating.nc);
      }
      const savedSubs = safeGet<PlatformBuckets<SubmissionDay[]>>(k(slug, "subs"));
      if (savedSubs) {
        setSubs(savedSubs);
        setHeatmapData(buildHeatmap(savedSubs));
      }
    }

    const savedSection = safeGetString(k(slug, "section"));
    if (savedSection === "home" || savedSection === "submissions" || savedSection === "contests") {
      setActiveSection(savedSection);
    }

    refreshAll();
  }, [slug, refreshAll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSectionChange = (s: Section) => {
    setActiveSection(s);
    safeSetString(k(slug, "section"), s);
  };

  const handleSave = useCallback(async (data: UserProfile) => {
    const merged = { ...profile, ...data, slug }; // slug 不可改
    setProfile(merged);

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });

    if (!res.ok) {
      setFetchError("保存资料失败,请重试");
      return;
    }

    const changed =
      data.cfHandle !== profile.cfHandle ||
      data.atcHandle !== profile.atcHandle ||
      data.ncHandle !== profile.ncHandle;

    if (changed) {
      // 清掉本地缓存，避免下次加载时先渲染旧handle的数据
      try {
        localStorage.removeItem(k(slug, "rating"));
        localStorage.removeItem(k(slug, "subs"));
      } catch { /* ignore */ }
      await refreshAll({ force: true });
    }
  }, [profile, slug, refreshAll]);

  return (
    <>
      {/* 左侧功能区 */}
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40 flex">
        <div
          className="w-3 h-32 cursor-pointer group"
          onMouseEnter={() => setNavOpen(true)}
          onClick={() => setNavOpen((prev) => !prev)}
        />
        <div
          className={`themed-bar flex flex-col gap-0.5 px-1.5 py-2.5 border rounded-r-xl transition-all duration-300 overflow-hidden min-w-[110px]
            ${navOpen ? "w-auto opacity-100" : "w-0 opacity-0 pointer-events-none"}
            lg:w-auto lg:opacity-100 lg:pointer-events-auto`}
          onMouseLeave={() => setNavOpen(false)}
        >
          <button
            onClick={() => handleSectionChange("home")}
            className={`text-[11px] py-1.5 px-2.5 rounded-lg whitespace-nowrap transition-colors ${
              activeSection === "home"
                ? "text-[var(--accent-text)] bg-[var(--accent-soft)]"
                : "text-foreground/60 hover:text-foreground hover:bg-[var(--surface-bg)]"
            }`}
          >首页</button>
          <button
            onClick={() => handleSectionChange("submissions")}
            className={`text-[11px] py-1.5 px-2.5 rounded-lg whitespace-nowrap transition-colors ${
              activeSection === "submissions"
                ? "text-[var(--accent-text)] bg-[var(--accent-soft)]"
                : "text-foreground/60 hover:text-foreground hover:bg-[var(--surface-bg)]"
            }`}
          >刷题日志</button>
          <div className="w-full h-px bg-[var(--card-border)] my-1" />
          <button
            onClick={() => handleSectionChange("contests")}
            className={`text-[11px] py-1.5 px-2.5 rounded-lg whitespace-nowrap transition-colors ${
              activeSection === "contests"
                ? "text-[var(--accent-text)] bg-[var(--accent-soft)]"
                : "text-foreground/60 hover:text-foreground hover:bg-[var(--surface-bg)]"
            }`}
          >近期比赛</button>
        </div>
      </div>

      {/* 顶部栏 */}
      <header className="themed-bar fixed top-0 left-0 right-0 z-30 border-b">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="w-16" />
          <div className="flex-1 flex justify-center px-4">
            <div className="opacity-80 max-w-[320px]">
              <ColorfulSignature text={profile.signature || "代码改变世界"} />
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ThemeToggle />
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[11px] font-medium text-foreground/80">{profile.name}</span>
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors"
              >编辑</button>
            </div>
            <div className="relative">
              <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[var(--card-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.avatar} alt="头像" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8">
        {fetching && (
          <div className="text-xs text-muted-foreground flex items-center gap-2 mb-4">
            <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />
            正在获取最新数据...
          </div>
        )}
        {fetchError && <div className="text-xs text-red-400/80 mb-4">{fetchError}</div>}

        {activeSection === "home" && (
          <section className="mb-8">
            <RatingCard cf={cfRating} atc={atcRating} nc={ncRating} cfContestHistory={cfContestHistory} atcContestHistory={atcContestHistory} ncContestHistory={ncContestHistory} heatmapData={heatmapData} loading={fetching} />
            <InsightCards subs={subs} />
          </section>
        )}

        {activeSection === "submissions" && (
          <section>
            <h2 className="text-sm font-medium mb-4 text-muted-foreground">
              刷题日志
            </h2>
            <SubmissionLog cfSubmissions={subs.cf} atcSubmissions={subs.atc} ncSubmissions={subs.nc} />
          </section>
        )}

        {activeSection === "contests" && (
          <section>
            <h2 className="text-sm font-medium mb-4 text-muted-foreground">
              近期比赛
            </h2>
            <ContestCalendar cfContests={contests.cf} atcContests={contests.atc} ncContests={contests.nc} />
          </section>
        )}
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        onSave={handleSave}
      />
    </>
  );
}
