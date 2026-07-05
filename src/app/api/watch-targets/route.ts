import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSlug } from "@/lib/profile";
import { getVisitorSlug } from "@/lib/visitor";

/**
 * GET    /api/watch-targets?slug=xxx   某用户的视奸对象列表
 * POST   /api/watch-targets            新增 { slug, nickname, cfHandle, atcHandle }
 * DELETE /api/watch-targets            删除 { slug, id }
 * 写操作校验 cookie 所有权(同 /api/profile)
 */

function shape(t: { id: string; nickname: string; cfHandle: string; atcHandle: string }) {
  return { id: t.id, nickname: t.nickname, cfHandle: t.cfHandle, atcHandle: t.atcHandle };
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") || "";
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  try {
    const targets = await prisma.watchTarget.findMany({
      where: { user: { slug } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(targets.map(shape));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{
      slug: string; nickname: string; cfHandle: string; atcHandle: string;
    }>;
    const slug = typeof body.slug === "string" ? body.slug : "";
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (slug !== (await getVisitorSlug())) {
      return NextResponse.json({ error: "只能修改自己的空间" }, { status: 403 });
    }
    const nickname = (body.nickname || "").trim();
    const cfHandle = (body.cfHandle || "").trim();
    const atcHandle = (body.atcHandle || "").trim();
    if (!nickname) {
      return NextResponse.json({ error: "备注名不能为空" }, { status: 400 });
    }
    if (!cfHandle && !atcHandle) {
      return NextResponse.json({ error: "至少填一个平台 handle" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { slug }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const target = await prisma.watchTarget.create({
      data: { userId: user.id, nickname, cfHandle, atcHandle },
    });
    return NextResponse.json(shape(target));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{ slug: string; id: string }>;
    const slug = typeof body.slug === "string" ? body.slug : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!isValidSlug(slug) || !id) {
      return NextResponse.json({ error: "slug and id required" }, { status: 400 });
    }
    if (slug !== (await getVisitorSlug())) {
      return NextResponse.json({ error: "只能修改自己的空间" }, { status: 403 });
    }
    // deleteMany 带 user.slug 条件,天然保证只能删自己名下的
    await prisma.watchTarget.deleteMany({ where: { id, user: { slug } } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
