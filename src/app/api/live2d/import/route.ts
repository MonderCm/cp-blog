import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { join, normalize, sep } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";

/**
 * POST /api/live2d/import
 * formData: file=<模型zip>, name=<角色名(目录名)>
 * 解压到 public/live2d/characters/<name>/,并做两件适配:
 * - 找到模型入口(*.model3.json / *.model.json),没有则报错
 * - Cubism4 模型若有未注册的 *.exp3.json 表情,自动补进 FileReferences.Expressions
 *   (VTube Studio 导出的模型普遍不注册,渲染库会读不到)
 */

const CHARACTERS_DIR = join(process.cwd(), "public", "live2d", "characters");
const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const NAME_RE = /^[\w一-龥-]{1,32}$/; // 字母数字下划线中文短横线

/**
 * 解出 zip 条目的真实文件名。
 * 中文 Windows 打包的 zip 普遍用 GBK 编码且不设 UTF-8 标志(bit 11),
 * adm-zip 默认按 UTF-8 解会得到乱码,导致模型内部引用对不上。
 * 策略:UTF-8 能无损往返就用 UTF-8,否则按 GBK 解。
 */
function decodeEntryName(entry: AdmZip.IZipEntry): string {
  const raw = entry.rawEntryName;
  const flags = (entry.header as unknown as { flags?: number }).flags ?? 0;
  const utf8 = raw.toString("utf8");
  if (flags & 0x800) return utf8; // 显式 UTF-8 标志
  if (!utf8.includes("�") && Buffer.from(utf8, "utf8").equals(raw)) return utf8;
  try { return new TextDecoder("gbk").decode(raw); } catch { return utf8; }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const nameRaw = formData.get("name");
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

    if (!file) return NextResponse.json({ error: "未选择文件" }, { status: 400 });
    if (!NAME_RE.test(name)) return NextResponse.json({ error: "角色名仅限中英文/数字/短横线,32字内" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "zip 不能超过 50MB" }, { status: 400 });

    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const entries = zip.getEntries();

    const named = entries
      .filter((e) => !e.isDirectory)
      .map((e) => ({ entry: e, name: decodeEntryName(e) }));

    const hasModel = named.some(
      ({ name: n }) => n.endsWith(".model3.json") || n.endsWith(".model.json")
    );
    if (!hasModel) {
      return NextResponse.json({ error: "zip 里没有找到模型入口(*.model3.json / *.model.json)" }, { status: 400 });
    }

    const targetDir = join(CHARACTERS_DIR, name);
    let modelJsonPath: string | null = null;
    const expFiles: string[] = [];

    for (const { entry, name: entryName } of named) {
      // 防路径穿越
      const rel = normalize(entryName).split("/").join(sep);
      if (rel.startsWith("..") || rel.includes(`..${sep}`)) continue;
      const dest = join(targetDir, rel);
      if (!dest.startsWith(targetDir)) continue;
      await mkdir(join(dest, ".."), { recursive: true });
      await writeFile(dest, entry.getData());
      if (rel.endsWith(".model3.json")) modelJsonPath = dest;
      if (rel.endsWith(".exp3.json")) expFiles.push(rel.split(sep).join("/"));
    }

    // Cubism4:把未注册的表情补进 model3.json
    if (modelJsonPath && expFiles.length > 0) {
      try {
        const model = JSON.parse(await readFile(modelJsonPath, "utf-8"));
        model.FileReferences = model.FileReferences || {};
        const existing = new Set(
          (model.FileReferences.Expressions || []).map((e: { File?: string }) => e.File)
        );
        const additions = expFiles
          .filter((f) => !existing.has(f))
          .map((f) => ({ Name: f.split("/").pop()!.replace(/\.exp3\.json$/, ""), File: f }));
        if (additions.length > 0) {
          model.FileReferences.Expressions = [...(model.FileReferences.Expressions || []), ...additions];
          await writeFile(modelJsonPath, JSON.stringify(model, null, 1), "utf-8");
        }
      } catch { /* 表情注册失败不阻塞导入 */ }
    }

    return NextResponse.json({ ok: true, name });
  } catch (e) {
    return NextResponse.json({ error: `导入失败: ${e}` }, { status: 500 });
  }
}
