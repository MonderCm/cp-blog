import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFContests } from "@/lib/cf-api";
import { fetchAtCContests } from "@/lib/atc-api";
import { fetchNCContests } from "@/lib/nc-api";
import type { Prisma } from "@prisma/client";

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface ContestEntry {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: string;
  url: string;
}

// In-memory cache for server-side
let memoryCache: { cf: ContestEntry[]; atc: ContestEntry[]; nc: ContestEntry[]; ts: number } | null = null;

export async function GET() {
  try {
    const now = Date.now();
    const isFreshInMemory = memoryCache && (now - memoryCache.ts) < CACHE_TTL;

    // 1. Try in-memory cache first
    if (isFreshInMemory) {
      return NextResponse.json(memoryCache);
    }

    // 2. Try database cache (persistent)
    let dbContests = [];
    try {
      dbContests = await prisma.contest.findMany({
        orderBy: { date: "asc" },
      });
    } catch (dbError) {
      console.warn("[contests] database query failed, falling back to live fetch", dbError);
    }
    const dbCf = dbContests.filter(c => c.platform === "CF");
    const dbAtc = dbContests.filter(c => c.platform === "AtC");
    const dbNc = dbContests.filter(c => c.platform === "NowCoder");
    const dbLatest = dbContests.length > 0
      ? Math.max(...dbContests.map(c => new Date(c.updatedAt).getTime()))
      : 0;
    const isFreshInDB = (now - dbLatest) < CACHE_TTL;

    const totalDb = dbCf.length + dbAtc.length + dbNc.length;
    if (isFreshInDB && totalDb > 0) {
      const result = {
        cf: dbCf.map(c => formatContest(c, "Codeforces")),
        atc: dbAtc.map(c => formatContest(c, "AtCoder")),
        nc: dbNc.map(c => formatContest(c, "牛客网")),
        ts: now,
      };
      memoryCache = result;
      return NextResponse.json(result);
    }

    // 3. DB is stale or empty — fetch live, save to memory cache immediately
    const [cf, atc, nc] = await Promise.allSettled([
      fetchCFContests(),
      fetchAtCContests(),
      fetchNCContests(),
    ]);

    const cfData = cf.status === "fulfilled" ? cf.value : [];
    const atcData = atc.status === "fulfilled" ? atc.value : [];
    const ncData = nc.status === "fulfilled"
      ? nc.value.map((c) => ({ ...c, platform: "牛客网" }))
      : [];

    const result = { cf: cfData, atc: atcData, nc: ncData, ts: now };
    memoryCache = result;

    // Persist to DB in background
    if (cfData.length > 0 || atcData.length > 0 || ncData.length > 0) {
      persistContests(cfData, atcData, ncData).catch((e) => console.error("[contests] persist error:", e));
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[contests] route error:", e);
    if (memoryCache) {
      return NextResponse.json(memoryCache);
    }
    return NextResponse.json({ cf: [], atc: [], nc: [], ts: Date.now() });
  }
}

function formatContest(
  c: { name: string; date: string; time: string; duration: string; url: string },
  platform: string
): ContestEntry {
  return {
    name: c.name,
    date: c.date,
    time: c.time,
    duration: c.duration,
    platform,
    url: c.url,
  };
}

async function persistContests(cfData: ContestEntry[], atcData: ContestEntry[], ncData: ContestEntry[]) {
  const upserts: Prisma.PrismaPromise<unknown>[] = [];
  for (const c of cfData) {
    upserts.push(
      prisma.contest.upsert({
        where: { platform_name_date: { platform: "CF", name: c.name, date: c.date } },
        create: { platform: "CF", name: c.name, date: c.date, time: c.time, duration: c.duration, url: c.url },
        update: { time: c.time, duration: c.duration, url: c.url },
      })
    );
  }
  for (const c of atcData) {
    upserts.push(
      prisma.contest.upsert({
        where: { platform_name_date: { platform: "AtC", name: c.name, date: c.date } },
        create: { platform: "AtC", name: c.name, date: c.date, time: c.time, duration: c.duration, url: c.url },
        update: { time: c.time, duration: c.duration, url: c.url },
      })
    );
  }
  for (const c of ncData) {
    upserts.push(
      prisma.contest.upsert({
        where: { platform_name_date: { platform: "NowCoder", name: c.name, date: c.date } },
        create: { platform: "NowCoder", name: c.name, date: c.date, time: c.time, duration: c.duration, url: c.url },
        update: { time: c.time, duration: c.duration, url: c.url },
      })
    );
  }
  await Promise.allSettled(upserts);
}
