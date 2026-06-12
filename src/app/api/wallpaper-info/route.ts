import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, copyFile, mkdir } from "fs/promises";
import { join, extname, resolve, sep } from "path";
import { existsSync } from "fs";

const PUBLIC_WP = join(process.cwd(), "public", "uploads", "wallpaper");
const VIDEO_EXTS = [".mp4", ".webm", ".mkv", ".avi"];

/**
 * 允许的壁纸父目录白名单，防止路径遍历读取任意文件。
 * 只允许 Steam workshop 目录和项目 public/uploads 下的路径。
 */
function isAllowedPath(inputPath: string): boolean {
  const resolved = resolve(inputPath);
  // 必须是绝对路径
  if (!resolved.startsWith(sep)) return false;
  // 禁止包含 .. 穿越（resolve 已规范化，再确认一次）
  if (resolved !== resolve(inputPath)) return false;
  // 白名单：只允许以下父目录
  const allowedParents: string[] = [];
  // Steam workshop 常见安装路径
  for (const drive of ["C:", "D:", "E:", "F:"]) {
    allowedParents.push(join(drive, "Steam", "steamapps", "workshop", "content"));
    allowedParents.push(join(drive, "Program Files (x86)", "Steam", "steamapps", "workshop", "content"));
  }
  // 也允许项目自身 public 下的壁纸目录
  allowedParents.push(resolve(PUBLIC_WP));
  return allowedParents.some((parent) => {
    const rp = resolve(parent);
    return resolved === rp || resolved.startsWith(rp + sep);
  });
}

export async function GET(request: NextRequest) {
  try {
    const folder = request.nextUrl.searchParams.get("folder");
    if (!folder) {
      return NextResponse.json({ error: "请提供壁纸文件夹路径" }, { status: 400 });
    }

    if (!existsSync(folder)) {
      return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
    }

    if (!isAllowedPath(folder)) {
      return NextResponse.json({ error: "不允许的路径，仅支持 Steam workshop 壁纸目录" }, { status: 403 });
    }

    // Read project.json
    const projectPath = join(folder, "project.json");
    if (!existsSync(projectPath)) {
      return NextResponse.json({ error: "文件夹中没有 project.json" }, { status: 404 });
    }

    const projectRaw = await readFile(projectPath, "utf-8");
    const project = JSON.parse(projectRaw);

    const wallpaperTitle = project.title || "未命名壁纸";
    const wallpaperType = project.type || "unknown";
    const fileRef = project.file || "";

    // Ensure public dir
    if (!existsSync(PUBLIC_WP)) {
      await mkdir(PUBLIC_WP, { recursive: true });
    }

    // Case 1: Video wallpaper → find & copy the video file
    const videoExt = VIDEO_EXTS.find((ext) => fileRef.endsWith(ext));
    if (videoExt) {
      const videoSrc = join(folder, fileRef);
      if (existsSync(videoSrc)) {
        const destName = sanitizeFilename(wallpaperTitle) + videoExt;
        const destPath = join(PUBLIC_WP, destName);
        await copyFile(videoSrc, destPath);
        return NextResponse.json({
          title: wallpaperTitle,
          type: "video",
          url: `/uploads/wallpaper/${destName}`,
        });
      }
    }

    // Case 2: Scene / Web / Application wallpaper → use preview.gif
    const files = await readdir(folder);
    const previewFile = files.find(
      (f) => f.toLowerCase() === "preview.gif" || f.toLowerCase() === "preview.jpg" || f.toLowerCase() === "preview.png"
    );

    if (previewFile) {
      const ext = extname(previewFile);
      const destName = sanitizeFilename(wallpaperTitle) + ext;
      const destPath = join(PUBLIC_WP, destName);
      await copyFile(join(folder, previewFile), destPath);
      return NextResponse.json({
        title: wallpaperTitle,
        type: "scene",
        preview: `/uploads/wallpaper/${destName}`,
      });
    }

    return NextResponse.json({
      error: `壁纸类型为 "${wallpaperType}"，但无可用的视频文件或预览图`,
    }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function sanitizeFilename(name: string): string {
  // Convert Chinese and special chars to safe ASCII, fallback to hash
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (safe.length < 2) {
    return "wallpaper_" + Date.now();
  }
  return safe.slice(0, 60);
}