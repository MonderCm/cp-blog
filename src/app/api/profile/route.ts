import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserBySlug,
  isValidSlug,
  PROFILE_FIELD_DEFAULTS,
} from "@/lib/profile";
import { getVisitorSlug } from "@/lib/visitor";

/**
 * GET    /api/profile?slug=xxx   读取用户资料
 * POST   /api/profile            更新自己的资料(cookie 所有权校验)
 * DELETE /api/profile?slug=xxx   删除自己的空间(cookie 所有权校验)
 */

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  const user = await getUserBySlug(slug);
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{
      slug: string;
      avatar: string;
      name: string;
      bio: string;
      signature: string;
      location: string;
      cfHandle: string;
      atcHandle: string;
      ncHandle: string;
    }>;

    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const visitor = await getVisitorSlug();
    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (slug !== visitor) {
      return NextResponse.json({ error: "只能修改自己的空间" }, { status: 403 });
    }

    const patch: Record<string, string> = {};
    const fields: (keyof typeof PROFILE_FIELD_DEFAULTS)[] = [
      "avatar", "name", "bio", "signature", "location",
      "cfHandle", "atcHandle", "ncHandle",
    ];
    for (const k of fields) {
      const v = body[k];
      if (typeof v === "string") patch[k] = v;
    }

    const user = await prisma.user.upsert({
      where: { slug },
      create: { slug, ...PROFILE_FIELD_DEFAULTS, ...patch },
      update: patch,
    });

    return NextResponse.json({
      slug: user.slug,
      avatar: user.avatar,
      name: user.name,
      bio: user.bio,
      signature: user.signature,
      location: user.location,
      cfHandle: user.cfHandle,
      atcHandle: user.atcHandle,
      ncHandle: user.ncHandle,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (slug !== (await getVisitorSlug())) {
      return NextResponse.json({ error: "只能删除自己的空间" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { slug } });
    if (!user) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // 删除关联的 RatingPoints
    await prisma.ratingPoint.deleteMany({ where: { userId: user.id } });
    // 删除用户
    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
