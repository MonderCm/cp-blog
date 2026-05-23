import fs from "fs";
import path from "path";
import HomePageClient, {
  type RatingData,
  type SubmissionDay,
  type Contest,
  type ProblemEntry,
} from "@/components/HomePageClient";

/* ========== 默认数据（JSON 文件缺失时回退） ========== */

const PROFILE = {
  avatar: "https://avatars.githubusercontent.com/u/583231?v=4",
  name: "huanqih",
  bio: "每天进步 1%，一年后就是 37.8 倍",
  signature: "代码改变世界 · 一题一世界，一步一乾坤",
  location: "北京",
  cfUsername: "tourist",
  atcUsername: "tourist",
};

const DEFAULT_CF_RATING: RatingData = {
  handle: "tourist", rating: 0, rank: "N/A", maxRating: 0, maxRank: "N/A", history: [],
};
const DEFAULT_ATC_RATING: RatingData = {
  handle: "tourist", rating: 0, rank: "N/A", maxRating: 0, maxRank: "N/A", history: [],
};

/* ========== 辅助函数 ========== */

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 将爬虫输出的 { "2026-05-22": [...], "2026-05-21": [...] } 转为
 * { date: string; problems: ProblemEntry[] }[] （按日期倒序）
 */
function ungroupSubmissions(grouped: Record<string, Omit<ProblemEntry, "date">[]>): SubmissionDay[] {
  return Object.entries(grouped)
    .map(([date, problems]) => ({ date, problems: problems as ProblemEntry[] }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 拼接标签供热力图使用 */
function buildHeatmapData(cf: SubmissionDay[], atc: SubmissionDay[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const day of cf) {
    const tags = day.problems.flatMap((p) => p.tags);
    if (tags.length) map[day.date] = tags;
  }
  for (const day of atc) {
    const tags = day.problems.flatMap((p) => p.tags);
    if (tags.length) {
      map[day.date] = [...(map[day.date] || []), ...tags];
    }
  }
  return map;
}

/* ========== 构建时数据加载 ========== */

const DATA_DIR = path.join(process.cwd(), "public", "data");

export default async function Home() {
  // Rating
  const cfRating = loadJson<RatingData>(
    path.join(DATA_DIR, "cf-rating.json"),
    DEFAULT_CF_RATING,
  );
  const atcRating = loadJson<RatingData>(
    path.join(DATA_DIR, "atc-rating.json"),
    DEFAULT_ATC_RATING,
  );

  // Submissions（爬虫按日期分组存储）
  const cfGrouped = loadJson<Record<string, ProblemEntry[]>>(
    path.join(DATA_DIR, "cf-submissions.json"),
    {},
  );
  const atcGrouped = loadJson<Record<string, ProblemEntry[]>>(
    path.join(DATA_DIR, "atc-submissions.json"),
    {},
  );
  const cfSubmissions = ungroupSubmissions(cfGrouped);
  const atcSubmissions = ungroupSubmissions(atcGrouped);

  // Contests
  const contestsRaw = loadJson<{
    cf_contests: Contest[];
    atc_contests: Contest[];
  }>(
    path.join(DATA_DIR, "contests.json"),
    { cf_contests: [], atc_contests: [] },
  );
  const cfContests = contestsRaw.cf_contests;
  const atcContests = contestsRaw.atc_contests;

  // Heatmap
  const heatmapData = buildHeatmapData(cfSubmissions, atcSubmissions);

  return (
    <HomePageClient
      profile={PROFILE}
      cfRating={cfRating}
      atcRating={atcRating}
      cfSubmissions={cfSubmissions}
      atcSubmissions={atcSubmissions}
      cfContests={cfContests}
      atcContests={atcContests}
      heatmapData={heatmapData}
    />
  );
}