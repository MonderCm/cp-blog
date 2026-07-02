"use client";

import { useEffect, useMemo, useState } from "react";

interface ColorfulSignatureProps {
  text: string;
}

const COLORS = [
  "#ff6b6b",
  "#4ecdc4",
  "#45b7d1",
  "#96ceb4",
  "#ffeaa7",
  "#a29bfe",
  "#fd79a8",
  "#55efc4",
];

function buildCharacters(text: string) {
  return text.split("").map((char, i) => ({
    char,
    color: COLORS[i % COLORS.length],
  }));
}

export default function ColorfulSignature({ text }: ColorfulSignatureProps) {
  const characters = useMemo(() => buildCharacters(text), [text]);
  const [yOffsets, setYOffsets] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setYOffsets(
        Array.from({ length: text.length }, (_, i) =>
          Math.sin(Date.now() / 400 + i * 0.3) * 4
        )
      );
    }, 50);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="flex items-center justify-center gap-1">
      {characters.map((c, i) => (
        <span
          key={i}
          className="text-2xl font-bold inline-block transition-transform duration-100 ease-out"
          style={{
            color: c.color,
            transform: `translateY(${yOffsets[i] ?? 0}px)`,
            textShadow: `0 0 8px ${c.color}30, 0 0 16px ${c.color}15`,
          }}
        >
          {c.char}
        </span>
      ))}
    </div>
  );
}
