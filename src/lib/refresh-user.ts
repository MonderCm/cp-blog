/**
 * 共享的 User 数据刷新逻辑，消除 /api/user、/api/cron/refresh、seed-user 三处重复。
 *
 * - refreshUserRating(): 拉取三平台 rating + history，写入 User + RatingPoint
 * - refreshUserSubmissions(): 拉取三平台提交记录，写入 Submission（去重）
 *
 * 所有拉取 fail-safe：单平台失败不影响其他平台，函数始终不抛异常。
 */

import { prisma } from "@/lib/prisma";
import {
  fetchCFRating,
  fetchCFRatingHistory,
  fetchCFSubmissions,
} from "@/lib/cf-api";
import { fetchAtCRating, fetchAtCSubmissions } from "@/lib/atc-api";
import { fetchNCRating, fetchNCSubmissions } from "@/lib/nc-api";

/* ========== Rating ========== */

export interface RatingRefreshResult {
  updated: string[];
  /** 拉取失败的平台 */
  failed: string[];
}

/**
 * 拉取三平台 rating + history，写入 User 表（rating/rank/max）和 RatingPoint 表。
 * 传空 handle 的平台会被跳过。
 */
export async function refreshUserRating(
  userId: string,
  cfHandle: string,
  atcHandle: string,
  ncHandle: string,
  opts?: { force?: boolean },
): Promise<RatingRefreshResult> {
  const result: RatingRefreshResult = { updated: [], failed: [] };

  // force refresh时清掉旧历史，避免旧handle的数据残留
  if (opts?.force) {
    await prisma.ratingPoint.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.submission.deleteMany({ where: { userId } }).catch(() => {});
  }

  const [cfR, cfH, atcR, ncR] = await Promise.allSettled([
    cfHandle ? fetchCFRating(cfHandle) : Promise.resolve(null),
    cfHandle ? fetchCFRatingHistory(cfHandle) : Promise.resolve([]),
    atcHandle ? fetchAtCRating(atcHandle) : Promise.resolve(null),
    ncHandle ? fetchNCRating(ncHandle) : Promise.resolve(null),
  ]);

  const patch: Record<string, number | string | Date> = { updatedAt: new Date() };

  if (cfHandle && cfR.status === "fulfilled" && cfR.value) {
    patch.cfRating = cfR.value.rating;
    patch.cfRank = cfR.value.rank;
    patch.cfMaxRating = cfR.value.maxRating;
    patch.cfMaxRank = cfR.value.maxRank;
    result.updated.push("CF");
  } else if (cfHandle && cfR.status === "rejected") {
    result.failed.push("CF");
  }

  if (atcHandle && atcR.status === "fulfilled" && atcR.value) {
    patch.atcRating = atcR.value.rating;
    patch.atcRank = atcR.value.rank;
    patch.atcMaxRating = atcR.value.maxRating;
    patch.atcMaxRank = atcR.value.maxRank;
    result.updated.push("AtC");
  } else if (atcHandle && atcR.status === "rejected") {
    result.failed.push("AtC");
  }

  if (ncHandle && ncR.status === "fulfilled" && ncR.value) {
    patch.ncRating = ncR.value.rating;
    patch.ncRank = ncR.value.rank;
    patch.ncMaxRating = ncR.value.maxRating;
    patch.ncMaxRank = ncR.value.maxRank;
    result.updated.push("NC");
  } else if (ncHandle && ncR.status === "rejected") {
    result.failed.push("NC");
  }

  if (Object.keys(patch).length > 1 /* more than just updatedAt */) {
    await prisma.user.update({ where: { id: userId }, data: patch });
  }

  // RatingPoint 历史
  const cfHist = cfH.status === "fulfilled" ? cfH.value : [];
  const atcHist = atcR.status === "fulfilled" && atcR.value?.history ? atcR.value.history : [];
  const ncHist = ncR.status === "fulfilled" && ncR.value?.history ? ncR.value.history : [];

  const points = [
    ...cfHist.map((p) => ({ userId, platform: "CF" as const, date: p.date, rating: p.rating })),
    ...atcHist.map((p) => ({ userId, platform: "AtC" as const, date: p.date, rating: p.rating })),
    ...ncHist.map((p) => ({ userId, platform: "NC" as const, date: p.date, rating: p.rating })),
  ];

  if (points.length > 0) {
    await prisma.ratingPoint.createMany({ data: points, skipDuplicates: true });
    // 已存在的点 rating 可能因重判变化，逐个 update（失败忽略）
    await prisma.$transaction(
      points.map((p) =>
        prisma.ratingPoint.update({
          where: { userId_platform_date: { userId: p.userId, platform: p.platform, date: p.date } },
          data: { rating: p.rating },
        })
      )
    ).catch(() => {});
  }

  return result;
}

/* ========== Submissions ========== */

export interface SubmissionsRefreshResult {
  total: number;
  failed: string[];
}

/**
 * 拉取三平台提交记录，写入 Submission 表（skipDuplicates）。
 * cfCount 控制 CF 拉取条数（默认 5000，覆盖注册至今的全部提交）。
 */
export async function refreshUserSubmissions(
  userId: string,
  cfHandle: string,
  atcHandle: string,
  ncHandle: string,
  opts?: { cfCount?: number; cfOnlyAC?: boolean; ncOnlyAC?: boolean; force?: boolean },
): Promise<SubmissionsRefreshResult> {
  const cfCount = opts?.cfCount ?? 5000;
  const cfOnlyAC = opts?.cfOnlyAC ?? false;
  const ncOnlyAC = opts?.ncOnlyAC ?? false;

  const result: SubmissionsRefreshResult = { total: 0, failed: [] };

  // force时先清旧提交，避免旧handle数据残留
  if (opts?.force) {
    await prisma.submission.deleteMany({ where: { userId } }).catch(() => {});
  }

  const [cfSubs, atcSubs, ncSubs] = await Promise.allSettled([
    cfHandle ? fetchCFSubmissions(cfHandle, cfCount) : Promise.resolve([]),
    atcHandle ? fetchAtCSubmissions(atcHandle) : Promise.resolve([]),
    ncHandle ? fetchNCSubmissions(ncHandle) : Promise.resolve([]),
  ]);

  const subs: Array<{
    userId: string;
    platform: string;
    problemId: string;
    problemName: string;
    problemUrl: string;
    tags: string[];
    score: number;
    submitTime: Date;
    language: string;
    verdict: string;
  }> = [];

  if (cfSubs.status === "fulfilled") {
    const filtered = cfOnlyAC ? cfSubs.value.filter((s) => s.verdict === "OK") : cfSubs.value;
    subs.push(
      ...filtered.map((s) => ({
        userId,
        platform: "CF" as const,
        problemId: `${s.problem.contestId}${s.problem.index}`,
        problemName: s.problem.name,
        problemUrl: `https://codeforces.com/problemset/problem/${s.problem.contestId}/${s.problem.index}`,
        tags: s.problem.tags || [],
        score: s.problem.rating || 0,
        submitTime: new Date(s.creationTimeSeconds * 1000),
        language: s.programmingLanguage,
        verdict: s.verdict,
      }))
    );
  } else if (cfHandle) {
    result.failed.push("CF");
  }

  if (atcSubs.status === "fulfilled") {
    subs.push(
      ...atcSubs.value.map((s) => ({
        userId,
        platform: "AtC" as const,
        problemId: s.problemId,
        problemName: s.problemName,
        problemUrl: s.problemUrl,
        tags: [] as string[],
        score: s.score,
        submitTime: new Date(s.submitTime * 1000),
        language: s.language,
        verdict: s.verdict,
      }))
    );
  } else if (atcHandle) {
    result.failed.push("AtC");
  }

  if (ncSubs.status === "fulfilled") {
    const filtered = ncOnlyAC ? ncSubs.value.filter((s) => s.verdict === "AC") : ncSubs.value;
    subs.push(
      ...filtered.map((s) => ({
        userId,
        platform: "NC" as const,
        problemId: s.problemId,
        problemName: s.problemName,
        problemUrl: s.problemUrl,
        tags: [] as string[],
        score: s.score,
        submitTime: new Date(s.submitTime * 1000),
        language: s.language,
        verdict: s.verdict,
      }))
    );
  } else if (ncHandle) {
    result.failed.push("NC");
  }

  if (subs.length > 0) {
    await prisma.submission.createMany({ data: subs, skipDuplicates: true });
    result.total = subs.length;
  }

  return result;
}
