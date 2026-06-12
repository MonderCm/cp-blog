import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshUserRating } from "@/lib/refresh-user";
import { fetchCFContestHistory } from "@/lib/cf-api";
import { fetchAtCContestHistory } from "@/lib/atc-api";
import { fetchNCContestHistory } from "@/lib/nc-api";
import { isValidSlug } from "@/lib/profile";

/**
 * GET /api/user?slug=xxx
 * 读取指定用户三平台 rating;DB 缓存优先,过期则后台回源
 *
 * 不再接受 cf/atc/nc 三参,handle 由 slug 关联的用户记录决定
 */

const CACHE_TTL = 4 * 60 * 60 * 1000;       // 4h: DB 数据被认为"新鲜"
const MEMORY_CACHE_TTL = 60 * 1000;          // 1min: 进程内 micro-cache

interface CacheEntry { body: object; timestamp: number; }
const memoryCache = new Map<string, CacheEntry>();
const refreshing = new Set<string>();

interface RatingPointRow { platform: string; date: string; rating: number; }

interface UserRow {
  cfHandle: string; atcHandle: string; ncHandle: string;
  cfRating: number; cfRank: string; cfMaxRating: number; cfMaxRank: string;
  atcRating: number; atcRank: string; atcMaxRating: number; atcMaxRank: string;
  ncRating: number; ncRank: string; ncMaxRating: number; ncMaxRank: string;
  ratingPoints: RatingPointRow[];
}

function shapeBody(user: UserRow, cached: boolean) {
  const points = user.ratingPoints || [];
  const shape = (h: string, key: "CF" | "AtC" | "NC") => {
    const prefix = key === "CF" ? "cf" : key === "AtC" ? "atc" : "nc";
    return {
      handle: h,
      rating: user[`${prefix}Rating` as `cfRating`],
      rank: user[`${prefix}Rank` as `cfRank`],
      maxRating: user[`${prefix}MaxRating` as `cfMaxRating`],
      maxRank: user[`${prefix}MaxRank` as `cfMaxRank`],
      history: points
        .filter((p) => p.platform === key)
        .map((p) => ({ date: p.date.replace(/\//g, "-"), rating: p.rating })),
    };
  };
  return {
    cf: shape(user.cfHandle, "CF"),
    atc: shape(user.atcHandle, "AtC"),
    nc: shape(user.ncHandle, "NC"),
    cached,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") || "";
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const cacheKey = `user:${slug}`;
  const cached = memoryCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return NextResponse.json(cached.body);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { slug },
      include: { ratingPoints: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const now = Date.now();
    const everPopulated = user.cfRating > 0 || user.atcRating > 0 || user.ncRating > 0;
    const isFresh = forceRefresh ? false : everPopulated && (now - user.updatedAt.getTime()) < CACHE_TTL;

    // 首次填充 或 force refresh → 同步等待刷新完再返回真数据
    if (!isFresh && (!everPopulated || forceRefresh)) {
      try {
        await refreshUserRating(user.id, user.cfHandle, user.atcHandle, user.ncHandle, { force: true });
        const fresh = await prisma.user.findUnique({
          where: { id: user.id },
          include: { ratingPoints: true },
        });
        if (fresh) {
          const freshBody = shapeBody(fresh, false);
          const [cfContestHistory, atcContestHistory, ncContestHistory] = await Promise.all([
            fetchCFContestHistory(user.cfHandle),
            fetchAtCContestHistory(user.atcHandle),
            fetchNCContestHistory(user.ncHandle),
          ]);
          const fullBody = { ...freshBody, cfContestHistory, atcContestHistory, ncContestHistory };
          memoryCache.set(cacheKey, { body: fullBody, timestamp: Date.now() });
          return NextResponse.json(fullBody);
        }
      } catch (e) {
        console.warn(`[user:${slug}] sync populate/refresh failed:`, e);
      }
    }

    const body = shapeBody(user, isFresh);
    const [cfContestHistory, atcContestHistory, ncContestHistory] = await Promise.all([
      fetchCFContestHistory(user.cfHandle),
      fetchAtCContestHistory(user.atcHandle),
      fetchNCContestHistory(user.ncHandle),
    ]);
    const fullBody = { ...body, cfContestHistory, atcContestHistory, ncContestHistory };
    if (!forceRefresh) memoryCache.set(cacheKey, { body: fullBody, timestamp: Date.now() });

    // 过期且未在刷新 → 后台拉新(不阻塞 UI)
    if (!isFresh && !refreshing.has(slug)) {
      refreshing.add(slug);
      refreshUserInBackground(slug, user.id, user.cfHandle, user.atcHandle, user.ncHandle, forceRefresh)
        .catch(() => {});
    }

    return NextResponse.json(fullBody);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function refreshUserInBackground(
  slug: string,
  userId: string,
  cfHandle: string,
  atcHandle: string,
  ncHandle: string,
  force: boolean,
) {
  try {
    await refreshUserRating(userId, cfHandle, atcHandle, ncHandle, { force });
    memoryCache.delete(`user:${slug}`);
  } catch (e) {
    console.warn(`[user:${slug}] background refresh failed:`, e);
  } finally {
    refreshing.delete(slug);
  }
}
