import { NextRequest, NextResponse } from "next/server";

/**
 * AtCoder 数据代理 — 绕过跨域限制
 *
 * GET /api/atcoder?username=xxx&type=rating|submissions|contests
 */

const ATC_BASE = "https://atcoder.jp";

async function fetchRating(username: string) {
  // Use AtCoder's official API
  const resp = await fetch(`https://atcoder.jp/users/${username}/history/json`);
  if (!resp.ok) {
    return {
      handle: username,
      rating: 0,
      rank: "unrated",
      maxRating: 0,
      maxRank: "unrated",
      history: [],
    };
  }

  const historyRaw = await resp.json();
  if (!Array.isArray(historyRaw) || historyRaw.length === 0) {
    return {
      handle: username,
      rating: 0,
      rank: "unrated",
      maxRating: 0,
      maxRank: "unrated",
      history: [],
    };
  }

  // Get latest rating and calculate max rating
  let rating = 0;
  let maxRating = 0;
  const allRatings = historyRaw.map((h: any) => h.NewRating || 0);
  
  if (allRatings.length > 0) {
    rating = allRatings[allRatings.length - 1];
    maxRating = Math.max(...allRatings);
  }

  // Determine rank based on rating
  const getRank = (r: number) => {
    if (r >= 2800) return "红";
    if (r >= 2400) return "橙";
    if (r >= 2000) return "黄";
    if (r >= 1600) return "蓝";
    if (r >= 1200) return "水";
    if (r >= 800) return "绿";
    if (r >= 400) return "棕";
    return "灰";
  };

  // Monthly history (last 6 months)
  const monthly: Record<string, number> = {};
  for (const item of historyRaw) {
    const date = item.EndTime.slice(0, 7);
    if (!monthly[date] || item.NewRating > monthly[date]) {
      monthly[date] = item.NewRating;
    }
  }
  const history = Object.entries(monthly)
    .map(([date, r]) => ({ date, rating: r }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6);

  return {
    handle: username,
    rating,
    rank: getRank(rating),
    maxRating,
    maxRank: getRank(maxRating),
    history,
  };
}

async function fetchContests() {
  const resp = await fetch(`${ATC_BASE}/contests/`, {
    headers: { "User-Agent": "Mozilla/5.0 CP-Blog/1.0" },
  });
  const html = await resp.text();

  const upcoming: unknown[] = [];
  const regex = /<tr[^>]*>[\s\S]*?<time[^>]*>(.*?)<\/time>[\s\S]*?<a href="(\/contests\/[^"]+)">(.*?)<\/a>[\s\S]*?<td[^>]*>(\d+:\d+)<\/td>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const [_, timeStr, href, name, duration] = match;
    const dateObj = new Date(timeStr);
    if (isNaN(dateObj.getTime())) continue;

    const now = new Date();
    if (dateObj < now) continue;

    upcoming.push({
      name,
      date: dateObj.toISOString().slice(0, 10),
      time: dateObj.toTimeString().slice(0, 5),
      duration,
      platform: "AtCoder",
      url: `${ATC_BASE}${href}`,
    });
  }

  return upcoming.slice(0, 5);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const type = searchParams.get("type") || "rating";

  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  try {
    if (type === "rating") {
      const data = await fetchRating(username);
      return NextResponse.json(data);
    }
    if (type === "contests") {
      const data = await fetchContests();
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 },
    );
  }
}