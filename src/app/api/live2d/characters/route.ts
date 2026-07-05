import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";

/**
 * GET /api/live2d/characters
 * 扫描 public/live2d/characters/,每个子目录即一个角色。
 * 目录内递归找模型入口(*.model3.json 优先,其次 *.model.json),
 * 新增角色 = 扔一个模型目录进去,无需改代码。
 */

const CHARACTERS_DIR = join(process.cwd(), "public", "live2d", "characters");

async function findModelJson(dir: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  const entries = await readdir(dir, { withFileTypes: true });
  // 当前层优先 model3.json(Cubism 4),其次 model.json(Cubism 2)
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const hit =
    files.find((f) => f.endsWith(".model3.json")) ||
    files.find((f) => f.endsWith(".model.json"));
  if (hit) return join(dir, hit);
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = await findModelJson(join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function GET() {
  try {
    const entries = await readdir(CHARACTERS_DIR, { withFileTypes: true });
    const characters: { name: string; modelUrl: string }[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const modelPath = await findModelJson(join(CHARACTERS_DIR, e.name));
      if (!modelPath) continue;
      // 文件系统路径 → 静态资源 URL
      const rel = modelPath
        .slice(join(process.cwd(), "public").length)
        .split("\\").join("/");
      characters.push({ name: e.name, modelUrl: rel });
    }
    return NextResponse.json(characters, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
