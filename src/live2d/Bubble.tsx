"use client";

/**
 * Bubble — 对话气泡
 *
 * 纯展示组件:给什么显示什么,DURATION 后自动消失;
 * text 变化(连续点击)会重置计时。
 */

import { useEffect, useState } from "react";

const DURATION = 4000;

interface BubbleProps {
  /** 要显示的台词;null 不渲染。连续点击传入新对象即可重置计时 */
  message: { text: string; ts: number } | null;
}

export default function Bubble({ message }: BubbleProps) {
  // 记录"已过期"的消息时间戳;新消息(ts 不同)天然可见,无需 effect 里同步 setState
  const [expiredTs, setExpiredTs] = useState<number | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setExpiredTs(message.ts), DURATION);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || expiredTs === message.ts) return null;

  return (
    <div
      className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 max-w-[220px] px-3 py-2 rounded-xl text-xs leading-relaxed shadow-lg animate-[fadeIn_0.15s_ease-out]"
      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
    >
      {message.text}
      {/* 底部小三角 */}
      <span
        className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 rotate-45 -mt-1"
        style={{ background: "var(--card-bg)", borderRight: "1px solid var(--card-border)", borderBottom: "1px solid var(--card-border)" }}
      />
    </div>
  );
}
