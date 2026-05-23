"use client";

import { useEffect, useRef, useState } from "react";

export interface BackgroundConfig {
  type: "color" | "gradient" | "video";
  value: string;
}

const STORAGE_KEY = "cp-blog-bg";
const DEFAULT_BG: BackgroundConfig = { type: "gradient", value: "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)" };

export function loadBG(): BackgroundConfig {
  if (typeof window === "undefined") return DEFAULT_BG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_BG;
}

export function saveBG(cfg: BackgroundConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export default function DynamicBackground({
  initial,
}: {
  initial?: BackgroundConfig;
}) {
  const [bg, setBG] = useState(initial || DEFAULT_BG);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stored = loadBG();
    if (stored.value !== bg.value || stored.type !== bg.type) setBG(stored);

    const onStorage = () => {
      setBG(loadBG());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoUrl = bg.type === "video" ? bg.value : "";

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {bg.type === "video" && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(0.25)" }}
        />
      )}
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={
          bg.type === "color"
            ? { background: bg.value }
            : bg.type === "gradient"
            ? { backgroundImage: bg.value }
            : { background: "linear-gradient(135deg, rgba(10,10,26,0.7), rgba(15,15,35,0.7))" }
        }
      />
      {/* 顶部渐变遮罩 */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-black/40 to-transparent" />
    </div>
  );
}