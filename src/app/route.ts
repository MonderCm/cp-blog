import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROFILE_FIELD_DEFAULTS, generateSlug } from "@/lib/profile";
import { VISITOR_COOKIE, getVisitorSlug } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/**
 * 首页 / → 每个访客一个独立空间:
 * 有 cookie 且用户存在 → 跳自己的主页;否则创建全新默认用户并种 cookie
 */
export async function GET(request: NextRequest) {
  const visitor = await getVisitorSlug();

  if (visitor) {
    const user = await prisma.user
      .findUnique({ where: { slug: visitor }, select: { slug: true } })
      .catch(() => null);
    if (user) {
      return NextResponse.redirect(new URL(`/u/${user.slug}`, request.url));
    }
  }

  const created = await prisma.user.create({
    data: { slug: generateSlug(), ...PROFILE_FIELD_DEFAULTS },
    select: { slug: true },
  });

  const res = NextResponse.redirect(new URL(`/u/${created.slug}`, request.url));
  res.cookies.set(VISITOR_COOKIE, created.slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
