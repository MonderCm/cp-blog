"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cp-blog-bg";

type BackgroundConfig =
  | { type: "color"; value: string }
  | { type: "gradient"; value: string }
  | { type: "video"; value: string }
  | { type: "wallpaper"; value: string; preview?: string };

const DEFAULT_BG: BackgroundConfig = {
  type: "gradient",
  value: [
    "radial-gradient(circle at 18% 8%, rgba(165, 180, 252, 0.18), transparent 30%)",
    "radial-gradient(circle at 82% 14%, rgba(167, 243, 208, 0.18), transparent 28%)",
    "radial-gradient(circle at 50% 90%, rgba(253, 230, 138, 0.12), transparent 35%)",
    "linear-gradient(180deg, #fafbfc 0%, #f6f7fa 100%)",
  ].join(", "),
};

const LEGACY_DEFAULT_GRADIENT =
  "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 40%, #0a0a2e 100%)";

let cachedRaw: string | null = null;
let cachedBG: BackgroundConfig = DEFAULT_BG;

function loadBG(): BackgroundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedBG;
    cachedRaw = raw;
    cachedBG = raw ? JSON.parse(raw) as BackgroundConfig : DEFAULT_BG;
    if (cachedBG.type === "gradient" && cachedBG.value === LEGACY_DEFAULT_GRADIENT) {
      cachedBG = DEFAULT_BG;
    }
    return cachedBG;
  } catch { /* ignore */ }
  return DEFAULT_BG;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("cp-bg-update", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("cp-bg-update", callback);
  };
}

function getSnapshot(): BackgroundConfig {
  return loadBG();
}

function getServerSnapshot(): null {
  return null;
}

export default function BackgroundProvider() {
  const bg = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!bg) return null;

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
  };

  if (bg.type === "color") {
    return (
      <div style={{ ...baseStyle, background: bg.value }} />
    );
  }

  if (bg.type === "gradient") {
    return (
      <div style={{ ...baseStyle, backgroundImage: bg.value }} />
    );
  }

  if (bg.type === "video") {
    return (
      <div style={baseStyle}>
        <video
          autoPlay
          loop
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          src={bg.value}
        />
        <div style={{ ...baseStyle, background: "rgba(255,255,255,0.10)" }} />
      </div>
    );
  }

  // wallpaper type: static preview image as fallback
  const bgImage = bg.preview || bg.value;
  return (
    <div style={baseStyle}>
      <img
        src={bgImage}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div style={{ ...baseStyle, background: "rgba(255,255,255,0.10)" }} />
    </div>
  );
}
