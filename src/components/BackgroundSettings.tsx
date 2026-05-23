"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BackgroundConfig, loadBG, saveBG } from "./DynamicBackground";

interface BackgroundSettingsProps {
  onClose: () => void;
}

export default function BackgroundSettings({ onClose }: BackgroundSettingsProps) {
  const [bg, setBG] = useState<BackgroundConfig>(loadBG());
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonError, setJsonError] = useState("");

  const presets = [
    { name: "深空黑", type: "color" as const, value: "#0a0a0f" },
    { name: "星空渐变", type: "gradient" as const, value: "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)" },
    { name: "紫夜", type: "gradient" as const, value: "radial-gradient(ellipse at 30% 20%, rgba(88, 28, 135, 0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.2) 0%, transparent 50%), linear-gradient(to bottom, #0a0a0f, #1e1b2e)" },
    { name: "赛博蓝", type: "gradient" as const, value: "linear-gradient(45deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.1) 25%, rgba(139, 92, 246, 0.1) 50%, rgba(236, 72, 153, 0.1) 75%, rgba(239, 68, 68, 0.1) 100%), #0a0a0f" },
  ];

  const handleApply = (newBG: BackgroundConfig) => {
    setBG(newBG);
    saveBG(newBG);
    // 触发全局更新
    window.dispatchEvent(new StorageEvent("storage", { key: "cp-blog-bg" }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFile(file);
    setJsonError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // Steam Wallpaper Engine JSON 格式解析
        if (json.file && json.file.endsWith?.(".mp4") || json.file.endsWith?.(".webm")) {
          const videoUrl = URL.createObjectURL(file);
          handleApply({ type: "video", value: videoUrl });
        } else {
          setJsonError("JSON 不是有效的 Steam 动态壁纸配置文件");
        }
      } catch {
        setJsonError("无法解析 JSON 文件");
      }
    };
    reader.readAsText(file);
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
              className="p-3 rounded-lg border border-white/[0.08] hover:border-indigo-500/50 transition-colors text-left"
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
        <h3 className="text-sm font-medium mb-3">自定义视频背景</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              上传 Steam 动态壁纸 JSON 文件
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="w-full text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            {jsonError && <p className="text-xs text-red-400 mt-1">{jsonError}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              支持 Steam Wallpaper Engine 导出的 .json 配置文件
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground">或</div>

          <button
            onClick={handleVideoUrl}
            className="w-full px-4 py-2 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            输入视频 URL
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">当前背景</h3>
        <div className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded"
              style={
                bg.type === "color"
                  ? { background: bg.value }
                  : bg.type === "gradient"
                  ? { backgroundImage: bg.value }
                  : { background: "linear-gradient(45deg, #8b5cf6, #3b82f6)" }
              }
            />
            <div className="flex-1">
              <div className="text-sm">
                {bg.type === "color" && "纯色背景"}
                {bg.type === "gradient" && "渐变背景"}
                {bg.type === "video" && "视频背景"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {bg.type === "video" ? bg.value.slice(0, 40) + "..." : bg.value.slice(0, 30)}
              </div>
            </div>
            <button
              onClick={() => handleApply(presets[1])}
              className="px-3 py-1 text-xs rounded bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-white/[0.06]">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}