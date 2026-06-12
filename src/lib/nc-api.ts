import { access, readFile } from "fs/promises";
import { join } from "path";

/**
 * NowCoder（牛客网）API 封装
 *
 * 牛客网没有公开 REST API，以下接口均抓取自其网页/JSONP 接口。
 * 注意：这些接口可能随时变化。
 */

export interface NCContestRaw {
  name: string;
  date: string;
  time: string;
  duration: string;
  url: string;
}

export interface NCRatingResult {
  uid: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

export interface NCContestHistoryEntry {
  date: string;
  oldRating: number;
  newRating: number;
}

export interface NCSubmissionRaw {
  id: string;
  problemId: string;
  problemName: string;
  problemUrl: string;
  verdict: string;
  language: string;
  score: number;
  submitTime: number; // unix timestamp seconds
}

interface NCCalendarContest {
  ojName?: string;
  startTime: number | string;
  endTime?: number | string;
  contestName?: string;
  name?: string;
  link?: string;
  contestId?: number | string;
  id?: number | string;
}

interface NCRatingHistoryEntry {
  time: string | number;
  rating: number;
}

export async function fetchNCContestHistory(uid: string): Promise<NCContestHistoryEntry[]> {
  if (!uid) return [];
  try {
    const resp = await fetch(
      `https://ac.nowcoder.com/acm/contest/rating-history?uid=${uid}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://ac.nowcoder.com/",
        },
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.code !== 0 || !Array.isArray(data.data)) return [];
    const entries = data.data as NCRatingHistoryEntry[];
    return entries.map((e, i) => ({
      date: new Date(e.time).toISOString().slice(0, 10),
      oldRating: i > 0 ? Math.round(entries[i - 1].rating) : 0,
      newRating: Math.round(e.rating),
    }));
  } catch {
    return [];
  }
}

/**
 * 获取近期牛客网比赛列表
 * 使用日历 API：https://ac.nowcoder.com/acm/calendar/contest
 */
export async function fetchNCContests(): Promise<NCContestRaw[]> {
  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const timestamp = Date.now();
    const second = (timestamp / 1000).toFixed(3);

    const resp = await fetch(
      `https://ac.nowcoder.com/acm/calendar/contest?token=&month=${month}&_=${second}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Referer": "https://ac.nowcoder.com/acm/contest/vip-index",
        },
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) return [];

    const data = await resp.json();
    if (data.code !== 0 || !Array.isArray(data.data)) return [];

    // 过滤出牛客网比赛，并转换为标准格式
    const ncContests = (data.data as NCCalendarContest[]).filter((c) => c.ojName === "NowCoder");
    return ncContests.map((c) => formatNCContest(c));
  } catch (e) {
    console.error("[nc-api] fetchNCContests error:", e);
    return [];
  }
}

function formatNCContest(c: NCCalendarContest): NCContestRaw {
  const startMs = typeof c.startTime === "number" ? c.startTime : Number(c.startTime);
  const endMs = typeof c.endTime === "number" ? c.endTime : Number(c.endTime || startMs + 7200000); // 默认2小时
  
  const startDate = new Date(startMs);
  const dateStr = startDate.toISOString().slice(0, 10);
  const timeStr = startDate.toTimeString().slice(0, 5);

  const durationMs = endMs - startMs;
  const hours = Math.floor(durationMs / 3600000);
  const mins = Math.round((durationMs % 3600000) / 60000);
  const durationStr = `${hours}:${mins.toString().padStart(2, "0")}`;

  return {
    name: c.contestName || c.name || "未知比赛",
    date: dateStr,
    time: timeStr,
    duration: durationStr,
    url: c.link || `https://ac.nowcoder.com/acm/contest/${c.contestId || c.id}`,
  };
}

/**
 * 获取牛客用户 Rating 数据
 * 通过牛客个人主页 HTML 解析获取（SSR 页面）
 */
export async function fetchNCRating(uid: string): Promise<NCRatingResult> {
  if (!uid) {
    return { uid, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
  }

  try {
    const resp = await fetch(
      `https://ac.nowcoder.com/acm/contest/profile/${uid}/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://ac.nowcoder.com/",
        },
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      return { uid, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
    }

    const html = await resp.text();
    
    // 解析用户名
    const nameMatch = html.match(/coder-name[^>]*data-title="([^"]+)"/);
    const username = nameMatch?.[1] ?? "";

    // 解析 Rating 和排名
    // HTML 结构: <a ... class="state-num rate-score4">1606</a></div><span>Rating</span>
    let rating = 0;
    let rank = "unrated";
    const history: { date: string; rating: number }[] = [];
    
    // 使用更简单的匹配：查找所有 status-item 块
    const statusItems = html.match(/<div class="status-item">([\s\S]*?)<\/div>\s*<span>([^<]+)<\/span>/g);
    if (statusItems) {
      for (const item of statusItems) {
        const labelMatch = item.match(/<span>([^<]+)<\/span>/);
        const valueMatch = item.match(/>(\d+)<\/a>/);
        if (labelMatch && valueMatch) {
          const label = labelMatch[1];
          const value = parseInt(valueMatch[1], 10);
          if (label === "Rating") {
            rating = value;
            rank = ncRankName(rating);
          } else if (label === "Rating排名") {
            console.debug(`[nc-api] ${username || uid} rating rank: ${value}`);
          }
        }
      }
    }

    // 从 rating-history API 获取历史数据
    try {
      const historyResp = await fetch(
        `https://ac.nowcoder.com/acm/contest/rating-history?uid=${uid}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://ac.nowcoder.com/",
          },
          next: { revalidate: 1800 },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (historyResp.ok) {
        const historyData = await historyResp.json();
        if (historyData.code === 0 && Array.isArray(historyData.data)) {
          for (const entry of historyData.data as NCRatingHistoryEntry[]) {
            const d = new Date(entry.time);
            const yearMonth = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            history.push({ date: yearMonth, rating: Math.round(entry.rating) });
          }
        }
      }
    } catch {
      // 降级：至少添加当前 rating
    }

    // 如果没有历史数据，至少添加当前 rating
    if (history.length === 0 && rating > 0) {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      history.push({ date: yearMonth, rating });
    }

    return {
      uid,
      rating,
      rank,
      maxRating: rating, // 牛客不提供历史最高分，用当前值
      maxRank: rank,
      history,
    };
  } catch (e) {
    console.error("[nc-api] fetchNCRating error:", e);
    return { uid, rating: 0, rank: "unrated", maxRating: 0, maxRank: "unrated", history: [] };
  }
}

function ncRankName(rating: number): string {
  if (rating >= 2800) return "legendary grandmaster";
  if (rating >= 2400) return "grandmaster";
  if (rating >= 2100) return "master";
  if (rating >= 1800) return "expert";
  if (rating >= 1500) return "specialist";
  if (rating >= 1200) return "pupil";
  if (rating > 0) return "newbie";
  return "unrated";
}

/**
 * 获取牛客用户提交记录
 * 通过牛客个人主页 AC 记录 API 获取
 */
// 预抓取数据文件归属的 uid。未匹配的 uid 一律返回空，避免错误地复用他人提交记录。
const NC_PREFETCH_OWNER_UID = process.env.NC_PREFETCH_UID || "597018199";

export async function fetchNCSubmissions(
  uid: string
): Promise<NCSubmissionRaw[]> {
  if (!uid) return [];
  if (uid !== NC_PREFETCH_OWNER_UID) {
    // 牛客没有公开 API，仅默认账号有本地预抓取数据可用
    return [];
  }

  try {
    const dataFile = join(process.cwd(), "nc-submissions.json");
    await access(dataFile);
    const raw = await readFile(dataFile, "utf-8");
    return JSON.parse(raw) as NCSubmissionRaw[];
  } catch {
    return [];
  }
}
