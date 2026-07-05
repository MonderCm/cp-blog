"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ContestCalendar from "@/components/ContestCalendar";
import SubmissionLog from "@/components/SubmissionLog";
import SettingsModal from "@/components/SettingsModal";
import InsightCards from "@/components/InsightCards";
import HomeHero from "@/components/HomeHero";
import type { HeatmapProblem } from "@/components/Heatmap";
import type { RatingData, SubmissionDay, PlatformBuckets } from "@/lib/types";
import type { CFContestHistoryEntry } from "@/lib/cf-api";
import type { AtCContestHistoryEntry } from "@/lib/atc-api";
import type { NCContestHistoryEntry } from "@/lib/nc-api";
import type { UserProfile } from "@/lib/profile";

export type { RatingData, ProblemEntry, SubmissionDay } from "@/lib/types";

// Live2D 桌宠:依赖 window/WebGL,仅客户端
const DesktopPet = dynamic(() => import("@/live2d/DesktopPet"), { ssr: false });

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
/** 页面视图:hero 是进站首屏(只有人物+入口),其余是点击宫格后的数据页 */
type View = "hero" | Section;

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

/** 今日 AC 题数(按题去重,跨平台合计),喂给桌宠说话用 */
function countTodaySolved(buckets: PlatformBuckets<SubmissionDay[]>): number {
  const today = new Date().toISOString().slice(0, 10); // 与提交数据同为 UTC 日期口径
  const seen = new Set<string>();
  (["cf", "atc", "nc"] as const).forEach((p) => {
    for (const day of buckets[p] || []) {
      if (day.date !== today) continue;
      for (const prob of day.problems) {
        if (prob.verdict === "AC" || prob.verdict === "OK") seen.add(`${p}#${prob.id}`);
      }
    }
  });
  return seen.size;
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
  const [view, setView] = useState<View>("hero");

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

    // 刷新/直链进入时从 URL hash 恢复板块,不踢回首屏
    const h = window.location.hash.slice(1);
    if (h === "home" || h === "submissions" || h === "contests") setView(h);

    refreshAll();
  }, [slug, refreshAll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* 视图切换写入浏览器历史 + URL hash:
   * - 后退/侧键回到首屏而不是退出网站
   * - 刷新后从 hash 恢复当前板块,不会被踢回首屏 */
  const isSection = (v: string): v is Section => v === "home" || v === "submissions" || v === "contests";

  const enterSection = useCallback((s: Section) => {
    window.history.pushState({ view: s }, "", `#${s}`);
    setView(s);
  }, []);

  const backToHero = useCallback(() => {
    // 由 enterSection 压入的历史 → 正常后退;刷新/直链进入(历史是 Next 内部状态)→ 原地切回
    if (window.history.state?.view) {
      window.history.back();
    } else {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setView("hero");
    }
  }, []);

  useEffect(() => {
    // bfcache/前进后退导致的水合卡死由 layout.tsx 的内联脚本负责刷新兜底
    const onPop = () => {
      const h = window.location.hash.slice(1);
      setView(isSection(h) ? h : "hero");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
      {view === "hero" ? (
        <>
          {/* 进站首屏:只有人物与功能入口,不展示数据 */}
          <HomeHero
            name={profile.name}
            cfHandle={profile.cfHandle}
            atcHandle={profile.atcHandle}
            ncHandle={profile.ncHandle}
            onEnterSection={enterSection}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* 首屏下方:待规划区域,先留框架 */}
          <div className="max-w-6xl mx-auto px-6 pb-10">
            <div className="h-px mb-6" style={{ background: "var(--surface-border)" }} />
            <div
              className="rounded-2xl border border-dashed flex items-center justify-center h-40 text-xs text-muted-foreground/60"
              style={{ borderColor: "var(--surface-border)" }}
            >
              待规划区域
            </div>
          </div>
        </>
      ) : (
        <div className="max-w-6xl mx-auto px-6 pt-5 pb-8">
          {/* 数据页顶栏:返回首屏 + 页面标题 */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={backToHero}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-foreground/70 hover:text-foreground transition-colors"
              style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}
            >
              ← 返回
            </button>
            <h2 className="text-sm font-medium text-muted-foreground">
              {view === "home" && "首页 · Rating 与统计"}
              {view === "submissions" && "学习记录"}
              {view === "contests" && "近期比赛"}
            </h2>
            {fetching && (
              <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />
            )}
          </div>
          {fetchError && <div className="text-xs text-red-400/80 mb-4">{fetchError}</div>}

          {view === "home" && (
            <section className="mb-8">
              <RatingCard cf={cfRating} atc={atcRating} nc={ncRating} cfContestHistory={cfContestHistory} atcContestHistory={atcContestHistory} ncContestHistory={ncContestHistory} heatmapData={heatmapData} loading={fetching} />
              <InsightCards subs={subs} />
            </section>
          )}

          {view === "submissions" && (
            <SubmissionLog cfSubmissions={subs.cf} atcSubmissions={subs.atc} ncSubmissions={subs.nc} slug={slug} />
          )}

          {view === "contests" && (
            <ContestCalendar cfContests={contests.cf} atcContests={contests.atc} ncContests={contests.nc} />
          )}
        </div>
      )}

      {/* 右下角 Live2D 桌宠:数据就绪后按今日 AC 数打招呼 */}
      <DesktopPet todaySolved={fetching ? undefined : countTodaySolved(subs)} />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        onSave={handleSave}
      />
    </>
  );
}
