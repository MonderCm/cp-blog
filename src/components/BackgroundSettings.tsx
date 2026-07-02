"use client";

import { useState, useRef } from "react";

const STORAGE_KEY = "cp-blog-bg";

type BackgroundConfig =
  | { type: "color"; value: string }
  | { type: "gradient"; value: string }
  | { type: "video"; value: string }
  | { type: "wallpaper"; value: string; preview?: string };

function loadBG(): BackgroundConfig {
  if (typeof window === "undefined") return { type: "gradient", value: "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BackgroundConfig;
  } catch { /* ignore */ }
  return { type: "gradient", value: "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)" };
}

function saveBG(bg: BackgroundConfig) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bg)); } catch { /* ignore */ }
}

interface BackgroundSettingsProps {
  onClose: () => void;
}

export default function BackgroundSettings({ onClose }: BackgroundSettingsProps) {
  const [bg, setBG] = useState<BackgroundConfig>(loadBG());
  const [wallpaperLoading, setWallpaperLoading] = useState(false);
  const [wallpaperError, setWallpaperError] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  const presets = [
    { name: "深空蓝", type: "color" as const, value: "#0a0a0f" },
    { name: "星空渐变", type: "gradient" as const, value: "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)" },
    { name: "紫夜", type: "gradient" as const, value: "radial-gradient(ellipse at 30% 20%, rgba(88, 28, 135, 0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.2) 0%, transparent 50%), linear-gradient(to bottom, #0a0a0f, #1e1b2e)" },
    { name: "赛博朋克", type: "gradient" as const, value: "linear-gradient(45deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.1) 25%, rgba(139, 92, 246, 0.1) 50%, rgba(236, 72, 153, 0.1) 75%, rgba(239, 68, 68, 0.1) 100%), #0a0a0f" },
  ];

  const handleApply = (newBG: BackgroundConfig) => {
    setBG(newBG);
    saveBG(newBG);
    window.dispatchEvent(new CustomEvent("cp-bg-update"));
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setWallpaperLoading(true);
    setWallpaperError("");

    const firstFile = files[0];
    const folderName = (firstFile as any).webkitRelativePath?.split("/")[0] || "壁纸文件夹";
    setSelectedLabel(folderName);

    // 优先找视频文件，其次找图片
    const videoExts = [".mp4", ".webm", ".mov", ".avi"];
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

    let mediaFile: File | null = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (videoExts.includes(ext)) { mediaFile = f; break; }
    }
    if (!mediaFile) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
        if (imageExts.includes(ext)) { mediaFile = f; break; }
      }
    }

    if (!mediaFile) {
      setWallpaperError("文件夹中未找到视频或图片文件");
      setWallpaperLoading(false);
      return;
    }

    const blobUrl = URL.createObjectURL(mediaFile);
    const isVideo = videoExts.includes(mediaFile.name.slice(mediaFile.name.lastIndexOf(".")).toLowerCase());

    if (isVideo) {
      handleApply({ type: "video", value: blobUrl });
    } else {
      handleApply({ type: "wallpaper", value: blobUrl, preview: blobUrl });
    }

    setWallpaperLoading(false);
  };

  const handleVideoUrl = () => {
    const url = prompt("输入视频 URL (MP4/WEBM):");
    if (url && (url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("video"))) {
      handleApply({ type: "video", value: url });
    } else if (url) {
      alert("请输入有效的视频 URL");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3">预设背景</h3>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleApply(preset)}
              className="p-3 rounded-lg transition-colors text-left"
              style={{ border: "1px solid var(--surface-border)" }}
            >
              <div
                className="w-full h-16 rounded mb-2"
                style={
                  preset.type === "color"
                    ? { background: preset.value }
                    : { backgroundImage: preset.value }
                }
              />
              <div className="text-xs">{preset.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Steam 动态壁纸</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              本地壁纸文件
            </label>
            <div className="flex gap-2">
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory 是非标准属性，Chrome/Edge 支持
                webkitdirectory=""
                onChange={handleFolderSelect}
                className="hidden"
              />
              <div className="flex-1 rounded-lg px-3 py-2 text-xs text-muted-foreground truncate" style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}>
                {selectedLabel || "未选择文件夹"}
              </div>
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={wallpaperLoading}
                className="px-3 py-2 text-xs rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
              >
                {wallpaperLoading ? "加载中..." : "选择文件夹"}
              </button>
            </div>
            {wallpaperError && <p className="text-xs text-red-400 mt-1">{wallpaperError}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              选择 Steam Wallpaper Engine 壁纸文件夹，自动提取视频或图片作为背景
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground">或</div>

          <div className="space-y-2">
            <button
              onClick={handleVideoUrl}
              className="w-full px-4 py-2 text-sm rounded-lg transition-colors"
              style={{ background: "var(--surface-bg)" }}
            >
              输入在线视频 URL
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">当前背景</h3>
        <div className="p-4 rounded-lg" style={{ border: "1px solid var(--surface-border)", background: "var(--surface-bg)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded"
              style={
                bg.type === "color"
                  ? { background: bg.value }
                  : bg.type === "gradient"
                  ? { backgroundImage: bg.value }
                  : bg.type === "video" || bg.type === "wallpaper"
                  ? { background: "linear-gradient(45deg, #8b5cf6, #3b82f6)" }
                  : { background: "linear-gradient(45deg, #8b5cf6, #3b82f6)" }
              }
            />
            <div className="flex-1">
              <div className="text-sm">
                {bg.type === "color" && "纯色背景"}
                {bg.type === "gradient" && "渐变背景"}
                {bg.type === "video" && "视频背景"}
                {bg.type === "wallpaper" && "本地壁纸"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {selectedLabel || "系统预设"}
              </div>
            </div>
            <button
              onClick={() => { setSelectedLabel(""); handleApply(presets[1]); }}
              className="px-3 py-1 text-xs rounded transition-colors"
              style={{ background: "var(--surface-bg)" }}
            >
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
          style={{ background: "var(--surface-bg)" }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
