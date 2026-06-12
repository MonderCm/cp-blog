import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserBySlug,
  isValidSlug,
  PROFILE_FIELD_DEFAULTS,
} from "@/lib/profile";

/**
 * GET    /api/profile?slug=xxx   读取用户资料
 * POST   /api/profile            创建/更新用户（无 slug 时自动生成）
 * DELETE /api/profile?slug=xxx   删除用户及关联数据
 */

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 12; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

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

    // 编辑已有用户时传 slug; 新建时不传，自动生成
    let slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const existing = slug ? await prisma.user.findUnique({ where: { slug } }) : null;

    if (!existing) {
      slug = generateSlug();
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
