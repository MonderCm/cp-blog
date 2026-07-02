/**
 * Codeforces API 封装
 */

const CF_API = "https://codeforces.com/api";
const UA = "Mozilla/5.0 CP-Blog/1.0";

export interface CFRatingResult {
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

export interface CFSubmissionRaw {
  id: number;
  contestId: number;
  problem: { contestId: number; index: string; name: string; tags: string[]; rating?: number };
  verdict: string;
  programmingLanguage: string;
  creationTimeSeconds: number;
}

export interface ContestEntry {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: "Codeforces" | "AtCoder" | "牛客网";
  url: string;
}

interface CFContestRaw {
  id: number;
  name: string;
  phase: string;
  startTimeSeconds: number;
  durationSeconds: number;
}

export interface CFContestHistoryEntry {
  date: string;
  contestName: string;
  contestUrl: string;
  rank: number;
  oldRating: number;
  newRating: number;
}

interface CFRatingUpdateRaw {
  contestId: number;
  contestName: string;
  rank: number;
  oldRating: number;
  newRating: number;
  ratingUpdateTimeSeconds: number;
}

function emptyRating(handle: string): CFRatingResult {
  return { handle, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
}

async function cfFetch(url: string, revalidate: number) {
  return fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
    next: { revalidate },
  });
}

export async function fetchCFRating(handle: string): Promise<CFRatingResult> {
  if (!handle) return emptyRating(handle);
  try {
    const resp = await cfFetch(`${CF_API}/user.info?handles=${encodeURIComponent(handle)}`, 3600);
    if (!resp.ok) return emptyRating(handle);
    const data = await resp.json();
    if (data.status !== "OK" || !data.result?.length) return emptyRating(handle);
    const user = data.result[0];
    return {
      handle: user.handle,
      rating: user.rating || 0,
      rank: user.rank || "unrated",
      maxRating: user.maxRating || 0,
      maxRank: user.maxRank || "unrated",
      history: [],
    };
  } catch {
    return emptyRating(handle);
  }
}

export async function fetchCFRatingHistory(handle: string): Promise<{ date: string; rating: number }[]> {
  if (!handle) return [];
  try {
    const resp = await cfFetch(`${CF_API}/user.rating?handle=${encodeURIComponent(handle)}`, 3600);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.status !== "OK" || !Array.isArray(data.result)) return [];
    const monthly: Record<string, number> = {};
    for (const item of data.result) {
      const date = new Date(item.ratingUpdateTimeSeconds * 1000).toISOString().slice(0, 7);
      if (!monthly[date] || item.newRating > monthly[date]) monthly[date] = item.newRating;
    }
    return Object.entries(monthly)
      .map(([date, rating]) => ({ date, rating }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);
  } catch {
    return [];
  }
}

export async function fetchCFContestHistory(handle: string): Promise<CFContestHistoryEntry[]> {
  if (!handle) return [];
  try {
    const resp = await cfFetch(`${CF_API}/user.rating?handle=${encodeURIComponent(handle)}`, 3600);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.status !== "OK" || !Array.isArray(data.result)) return [];
    return data.result.map((item: CFRatingUpdateRaw) => ({
      date: new Date(item.ratingUpdateTimeSeconds * 1000).toISOString().slice(0, 10),
      contestName: item.contestName,
      contestUrl: `https://codeforces.com/contest/${item.contestId}`,
      rank: item.rank,
      oldRating: item.oldRating,
      newRating: item.newRating,
    }));
  } catch {
    return [];
  }
}

export async function fetchCFSubmissions(handle: string, count = 100): Promise<CFSubmissionRaw[]> {
  if (!handle) return [];
  try {
    const resp = await cfFetch(`${CF_API}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`, 600);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.status !== "OK" || !Array.isArray(data.result)) return [];
    return data.result;
  } catch {
    return [];
  }
}

export async function fetchCFContests(): Promise<ContestEntry[]> {
  try {
    const resp = await cfFetch(`${CF_API}/contest.list?gym=false`, 1800);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.status !== "OK" || !Array.isArray(data.result)) return [];
    return data.result
      .filter((c: CFContestRaw) => c.phase === "BEFORE")
      .map((c: CFContestRaw) => ({
        name: c.name,
        date: new Date(c.startTimeSeconds * 1000).toISOString().slice(0, 10),
        time: new Date(c.startTimeSeconds * 1000).toTimeString().slice(0, 5),
        duration: `${Math.floor(c.durationSeconds / 3600)}:${String(Math.floor((c.durationSeconds % 3600) / 60)).padStart(2, "0")}`,
        platform: "Codeforces" as const,
        url: `https://codeforces.com/contests/${c.id}`,
      }))
      .slice(0, 10);
  } catch {
    return [];
  }
}
