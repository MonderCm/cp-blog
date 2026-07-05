import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFSubmissions } from "@/lib/cf-api";
import { fetchAtCSubmissions } from "@/lib/atc-api";
import { isValidSlug } from "@/lib/profile";

/**
 * GET /api/watch-targets/submissions?slug=xxx&targetId=yyy
 * 实时拉某视奸对象的 CF/AtC 提交并按天分组;返回格式与 /api/submissions 一致。
 * 牛客的 fetchNCSubmissions 只能拉登录者本人 → nc 恒为空数组。
 */

const MEMORY_CACHE_TTL = 5 * 60 * 1000;
interface CacheEntry { body: object; timestamp: number; }
const memoryCache = new Map<string, CacheEntry>();

interface FlatSub {
  submitTime: Date; problemId: string; problemName: string; problemUrl: string;
  tags: string[]; score: number; language: string; verdict: string;
}

// 与 /api/submissions 的 groupSubmissions 同构(route 文件不能导出额外函数,只能复制)
function groupSubmissions(subs: FlatSub[]) {
  const grouped: Record<string, unknown[]> = {};
  for (const s of subs) {
    const date = s.submitTime.toISOString().slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push({
      id: s.problemId,
      name: s.problemName,
      url: s.problemUrl,
      score: s.score,
      tags: s.tags,
      time: s.submitTime.toTimeString().slice(0, 5),
      language: s.language,
      verdict: s.verdict,
    });
  }
  return Object.entries(grouped)
    .map(([date, problems]) => ({ date, problems }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") || "";
  const targetId = searchParams.get("targetId") || "";
  if (!isValidSlug(slug) || !targetId) {
    return NextResponse.json({ error: "slug and targetId required" }, { status: 400 });
  }

  const cacheKey = `watch-subs:${targetId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return NextResponse.json(cached.body);
  }

  try {
    const target = await prisma.watchTarget.findFirst({
      where: { id: targetId, user: { slug } },
    });
    if (!target) {
      return NextResponse.json({ error: "target not found" }, { status: 404 });
    }

    const [cfRes, atcRes] = await Promise.allSettled([
      target.cfHandle ? fetchCFSubmissions(target.cfHandle, 200) : Promise.resolve([]),
      target.atcHandle ? fetchAtCSubmissions(target.atcHandle) : Promise.resolve([]),
    ]);

    const cfSubs: FlatSub[] = cfRes.status === "fulfilled"
      ? cfRes.value.map((s) => ({
          submitTime: new Date(s.creationTimeSeconds * 1000),
          problemId: `${s.problem.contestId}${s.problem.index}`,
          problemName: s.problem.name,
          problemUrl: `https://codeforces.com/problemset/problem/${s.problem.contestId}/${s.problem.index}`,
          tags: s.problem.tags || [],
          score: s.problem.rating || 0,
          language: s.programmingLanguage,
          verdict: s.verdict,
        }))
      : [];

    const atcSubs: FlatSub[] = atcRes.status === "fulfilled"
      ? atcRes.value.map((s) => ({
          submitTime: new Date(s.submitTime * 1000),
          problemId: s.problemId,
          problemName: s.problemName,
          problemUrl: s.problemUrl,
          tags: [],
          score: s.score,
          language: s.language,
          verdict: s.verdict,
        }))
      : [];

    const body = {
      cf: groupSubmissions(cfSubs),
      atc: groupSubmissions(atcSubs),
      nc: [],
      cached: false,
    };
    memoryCache.set(cacheKey, { body, timestamp: Date.now() });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
