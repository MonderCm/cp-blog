import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { isValidSlug } from "@/lib/profile";
import { getVisitorSlug } from "@/lib/visitor";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "avatars");
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

/**
 * POST /api/upload-avatar
 * formData: file=<image>, slug=<user-slug>
 * 头像按 slug 隔离命名,避免多用户互相覆盖
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slugRaw = formData.get("slug");
    const slug = typeof slugRaw === "string" ? slugRaw : "";

    if (!file) {
      return NextResponse.json({ error: "未选择文件" }, { status: 400 });
    }
    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (slug !== (await getVisitorSlug())) {
      return NextResponse.json({ error: "只能修改自己的空间" }, { status: 403 });
    }

    const safeExt = ALLOWED_TYPES.get(file.type);
    if (!safeExt) {
      return NextResponse.json({ error: "仅支持图片文件" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "文件大小不能超过 5MB" }, { status: 400 });
    }

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // 命名:<slug>_<timestamp>.<ext>;时间戳避免浏览器缓存旧头像
    const filename = `${slug}_${Date.now()}.${safeExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    return NextResponse.json({ url: `/uploads/avatars/${filename}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
