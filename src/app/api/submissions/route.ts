import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshUserSubmissions } from "@/lib/refresh-user";
import { isValidSlug } from "@/lib/profile";

/**
 * GET /api/submissions?slug=xxx
 * 读取指定用户的提交记录(三平台合并),DB 缓存优先
 */

const CACHE_TTL = 4 * 60 * 60 * 1000;
const MEMORY_CACHE_TTL = 60 * 1000;

interface CacheEntry { body: object; timestamp: number; }
const memoryCache = new Map<string, CacheEntry>();
const refreshing = new Set<string>();

function groupSubmissions(subs: { submitTime: Date; platform: string; problemId: string; problemName: string; problemUrl: string; tags: string[]; score: number; language: string; verdict: string }[]) {
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
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const cacheKey = `subs:${slug}${forceRefresh ? "|refresh" : ""}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return NextResponse.json(cached.body);
  }

  try {
    const user = await prisma.user.findUnique({ where: { slug } });
    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const cachedSubs = await prisma.submission.findMany({
      where: { userId: user.id },
      orderBy: { submitTime: "desc" },
    });

    const now = Date.now();
    const isFresh = forceRefresh
      ? false
      : cachedSubs.length > 0 && (now - user.updatedAt.getTime()) < CACHE_TTL;

    // force refresh → 同步等待拉完再返回
    if (forceRefresh && !refreshing.has(slug)) {
      refreshing.add(slug);
      try {
        await refreshUserSubmissions(user.id, user.cfHandle, user.atcHandle, user.ncHandle, { force: true });
        await prisma.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } }).catch(() => {});
        memoryCache.delete(`subs:${slug}`);
        // 重新读取
        const freshSubs = await prisma.submission.findMany({
          where: { userId: user.id }, orderBy: { submitTime: "desc" },
        });
        const freshBody = {
          cf: groupSubmissions(freshSubs.filter((s) => s.platform === "CF")),
          atc: groupSubmissions(freshSubs.filter((s) => s.platform === "AtC")),
          nc: groupSubmissions(freshSubs.filter((s) => s.platform === "NC")),
          cached: false,
        };
        memoryCache.set(cacheKey, { body: freshBody, timestamp: Date.now() });
        refreshing.delete(slug);
        return NextResponse.json(freshBody);
      } catch (e) {
        console.warn(`[submissions:${slug}] sync refresh failed:`, e);
        refreshing.delete(slug);
      }
    }

    const body = {
      cf: groupSubmissions(cachedSubs.filter((s) => s.platform === "CF")),
      atc: groupSubmissions(cachedSubs.filter((s) => s.platform === "AtC")),
      nc: groupSubmissions(cachedSubs.filter((s) => s.platform === "NC")),
      cached: isFresh,
    };

    if (!forceRefresh) memoryCache.set(cacheKey, { body, timestamp: Date.now() });

    if (!isFresh && !refreshing.has(slug)) {
      refreshing.add(slug);
      refreshSubmissionsInBackground(user.id, user.cfHandle, user.atcHandle, user.ncHandle, slug, forceRefresh)
        .catch(() => {});
    }

    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function refreshSubmissionsInBackground(
  userId: string,
  cfHandle: string,
  atcHandle: string,
  ncHandle: string,
  slug: string,
  force: boolean,
) {
  try {
    await refreshUserSubmissions(userId, cfHandle, atcHandle, ncHandle, { force });
    await prisma.user.update({ where: { id: userId }, data: { updatedAt: new Date() } }).catch(() => {});
    memoryCache.delete(`subs:${slug}`);
  } finally {
    refreshing.delete(slug);
  }
}
