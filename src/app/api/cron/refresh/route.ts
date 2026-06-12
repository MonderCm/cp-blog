import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshUserRating, refreshUserSubmissions } from "@/lib/refresh-user";

/**
 * 定时任务:遍历所有 User,刷新三平台 rating 与最近提交
 * 触发:外部 cron(Vercel Cron / GitHub Actions),需带 Bearer CRON_SECRET
 */

const CONCURRENCY = 3; // 多用户场景调低,避免 CF API 触发限流

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      try { await worker(items[i]); } catch { /* counted by caller */ }
    }
  });
  await Promise.all(runners);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({ take: 200 });
    const result = { users: users.length, updated: 0, partial: 0, failed: 0 };
    const errors: { slug: string; reason: string }[] = [];

    await runWithConcurrency(users, CONCURRENCY, async (user) => {
      try {
        // 拉取 rating + history
        const ratingResult = await refreshUserRating(
          user.id, user.cfHandle, user.atcHandle, user.ncHandle, { force: true },
        );

        // 拉取提交记录
        const subsResult = await refreshUserSubmissions(
          user.id, user.cfHandle, user.atcHandle, user.ncHandle,
          { cfOnlyAC: true, ncOnlyAC: true },
        );

        if (ratingResult.failed.length > 0) {
          result.partial++;
          errors.push({ slug: user.slug, reason: `partial rating: ${ratingResult.failed.join(",")}` });
        } else if (subsResult.failed.length > 0) {
          result.partial++;
          errors.push({ slug: user.slug, reason: `partial subs: ${subsResult.failed.join(",")}` });
        } else {
          result.updated++;
        }
      } catch (e) {
        result.failed++;
        errors.push({ slug: user.slug, reason: `db update: ${e}` });
      }
    });

    return NextResponse.json({
      ...result,
      errors: errors.slice(0, 20),
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
