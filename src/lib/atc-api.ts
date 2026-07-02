/**
 * AtCoder API 封装
 */

const ATC_BASE = "https://atcoder.jp";
const UA = "Mozilla/5.0 CP-Blog/1.0";

interface AtCHistoryEntry {
  ContestName?: string;
  ContestNameEn?: string;
  ContestScreenName?: string;
  EndTime: string;
  IsRated?: boolean;
  NewRating?: number;
}

export interface AtCRatingResult {
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

export interface AtCContestHistoryEntry {
  date: string;
  contestName: string;
  contestUrl: string;
  rank: number;
  oldRating: number;
  newRating: number;
}

export async function fetchAtCContestHistory(handle: string): Promise<AtCContestHistoryEntry[]> {
  if (!handle) return [];
  try {
    const resp = await fetch(`${ATC_BASE}/users/${handle}/history/json`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!resp.ok) return [];
    const historyRaw = await resp.json();
    if (!Array.isArray(historyRaw)) return [];
    const typed = (historyRaw as AtCHistoryEntry[]).filter((h) => h.IsRated && typeof h.NewRating === "number");
    if (typed.length === 0) return [];
    return typed.map((h, i) => {
      const contestId = (h.ContestScreenName || "").replace(".contest.atcoder.jp", "");
      return {
        date: h.EndTime.slice(0, 10).replace(/\//g, "-"),
        contestName: h.ContestNameEn || h.ContestName || h.ContestScreenName || "",
        contestUrl: contestId ? `${ATC_BASE}/contests/${contestId}` : "",
        rank: 0,
        oldRating: i > 0 ? (typed[i - 1].NewRating || 0) : 0,
        newRating: h.NewRating || 0,
      };
    });
  } catch {
    return [];
  }
}

function getAtCRank(r: number): string {
  if (r >= 2800) return "红";
  if (r >= 2400) return "橙";
  if (r >= 2000) return "黄";
  if (r >= 1600) return "蓝";
  if (r >= 1200) return "水";
  if (r >= 800) return "绿";
  if (r >= 400) return "棕";
  return "灰";
}

function emptyRating(handle: string): AtCRatingResult {
  return { handle, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
}

export async function fetchAtCRating(handle: string): Promise<AtCRatingResult> {
  if (!handle) return emptyRating(handle);
  try {
    const resp = await fetch(`${ATC_BASE}/users/${handle}/history/json`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!resp.ok) return emptyRating(handle);
    const historyRaw = await resp.json();
    if (!Array.isArray(historyRaw)) return emptyRating(handle);

    const typedHistory = (historyRaw as AtCHistoryEntry[])
      .filter((h) => h.IsRated && typeof h.NewRating === "number");
    if (typedHistory.length === 0) return emptyRating(handle);

    const allRatings = typedHistory.map((h) => h.NewRating!);
    const rating = allRatings[allRatings.length - 1];
    const maxRating = Math.max(...allRatings);

    const monthly: Record<string, number> = {};
    for (const item of typedHistory) {
      const date = item.EndTime.slice(0, 7).replace(/\//g, "-");
      const newRating = item.NewRating || 0;
      if (!monthly[date] || newRating > monthly[date]) monthly[date] = newRating;
    }
    const history = Object.entries(monthly)
      .map(([date, r]) => ({ date, rating: r }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);

    return {
      handle,
      rating,
      rank: getAtCRank(rating),
      maxRating,
      maxRank: getAtCRank(maxRating),
      history,
    };
  } catch {
    return emptyRating(handle);
  }
}

export interface AtCSubmissionRaw {
  id: string;
  problemId: string;
  problemName: string;
  contestId: string;
  problemUrl: string;
  verdict: string;
  language: string;
  score: number;
  submitTime: number;
}

/* kenkoooo AtCoder Problems API —— AtCoder 官方无提交记录接口,这是社区标准数据源 */
const KENKOOOO_BASE = "https://kenkoooo.com/atcoder";

interface KenkooooSubmission {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  language: string;
  point: number;
  result: string;
}

/** problem_id → 题目名(如 "abc300_a" → "A. N-choice question"),进程内缓存 */
let problemNames: Map<string, string> | null = null;

async function getProblemNames(): Promise<Map<string, string>> {
  if (problemNames) return problemNames;
  try {
    const resp = await fetch(`${KENKOOOO_BASE}/resources/problems.json`, {
      // kenkoooo API 强制要求 gzip,缺这个头会 403
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 86400 },
    });
    if (!resp.ok) return new Map();
    const list = (await resp.json()) as { id: string; title: string }[];
    problemNames = new Map(list.map((p) => [p.id, p.title]));
    return problemNames;
  } catch {
    return new Map(); // 失败不缓存,下次重试;题目名回退为 problem_id
  }
}

/**
 * 拉取用户全部提交(kenkoooo v3 API,按 from_second 翻页,每页最多 500 条)
 */
export async function fetchAtCSubmissions(handle: string): Promise<AtCSubmissionRaw[]> {
  if (!handle) return [];
  try {
    const namesPromise = getProblemNames();

    const all: KenkooooSubmission[] = [];
    let fromSecond = 0;
    for (let page = 0; page < 20; page++) {
      const resp = await fetch(
        `${KENKOOOO_BASE}/atcoder-api/v3/user/submissions?user=${encodeURIComponent(handle)}&from_second=${fromSecond}`,
        {
          headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
          signal: AbortSignal.timeout(10000),
          next: { revalidate: 3600 },
        }
      );
      if (!resp.ok) break;
      const batch = (await resp.json()) as KenkooooSubmission[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 500) break;
      fromSecond = batch[batch.length - 1].epoch_second + 1;
    }

    const names = await namesPromise;
    return all.map((s) => ({
      id: `atc-${s.id}`,
      problemId: s.problem_id,
      problemName: names.get(s.problem_id) || s.problem_id,
      contestId: s.contest_id,
      problemUrl: `${ATC_BASE}/contests/${s.contest_id}/tasks/${s.problem_id}`,
      verdict: s.result,
      language: s.language,
      score: Math.round(s.point),
      submitTime: s.epoch_second,
    }));
  } catch (e) {
    console.error("[atc-api] fetchAtCSubmissions error:", e);
    return [];
  }
}

export interface AtCContestEntry {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: "AtCoder";
  url: string;
}

export async function fetchAtCContests(): Promise<AtCContestEntry[]> {
  try {
    const resp = await fetch(`${ATC_BASE}/contests/`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 1800 },
    });
    if (!resp.ok) return [];
    const html = await resp.text();

    const upcoming: AtCContestEntry[] = [];
    const regex = /<tr[^>]*>[\s\S]*?<time[^>]*>(.*?)<\/time>[\s\S]*?<a href="(\/contests\/[^"]+)">(.*?)<\/a>[\s\S]*?<td[^>]*>(\d+:\d+)<\/td>/g;
    const now = Date.now();
    let match;
    while ((match = regex.exec(html)) !== null) {
      const [, timeStr, href, name, duration] = match;
      const dateObj = new Date(timeStr);
      if (isNaN(dateObj.getTime()) || dateObj.getTime() < now) continue;
      upcoming.push({
        name,
        date: dateObj.toISOString().slice(0, 10),
        time: dateObj.toTimeString().slice(0, 5),
        duration,
        platform: "AtCoder",
        url: `${ATC_BASE}${href}`,
      });
    }
    return upcoming.slice(0, 10);
  } catch {
    return [];
  }
}
