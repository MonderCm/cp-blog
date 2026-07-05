"use client";

/**
 * DesktopPet — 桌宠入口组件(右下角悬浮)
 *
 * 组织各模块:CharacterManager(角色)+ DialogueManager(台词)+ Bubble(气泡),
 * 自己负责拖动、滚轮缩放、位置持久化、设置弹出层。
 * 通过 next/dynamic ssr:false 挂载(依赖 window/WebGL)。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Live2DView } from "./Live2DView";
import { CharacterManager, fetchCharacters } from "./CharacterManager";
import { getExpressionDialogue, getRandomTouchDialogue, getTaskDialogue } from "./DialogueManager";
import Bubble from "./Bubble";
import type { CharacterInfo, PetTransform } from "./types";

const TRANSFORM_KEY = "cp-pet:transform";
const LOCKED_KEY = "cp-pet:locked";
/** 基准宽度;高度由模型宽高比自适应(h = w / aspect),避免固定框裁切模型 */
const BASE_W = 180;
/** 模型加载完成前的兜底宽高比 */
const FALLBACK_ASPECT = 180 / 220;
const SCALE_MIN = 0.6, SCALE_MAX = 2;
/** 指针按下后移动超过该距离(px)视为拖动,不触发点击台词 */
const DRAG_THRESHOLD = 5;

function petSize(scale: number, aspect: number): { w: number; h: number } {
  const w = BASE_W * scale;
  return { w, h: w / aspect };
}

function defaultTransform(aspect: number): PetTransform {
  if (typeof window === "undefined") return { x: 0, y: 0, scale: 1 };
  const { w, h } = petSize(1, aspect);
  return {
    x: Math.max(8, window.innerWidth - w - 24),
    y: Math.max(8, window.innerHeight - h - 24),
    scale: 1,
  };
}

function clampTransform(t: PetTransform, aspect: number): PetTransform {
  const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, t.scale));
  const { w, h } = petSize(scale, aspect);
  return {
    x: Math.min(Math.max(0, t.x), Math.max(0, window.innerWidth - w)),
    y: Math.min(Math.max(0, t.y), Math.max(0, window.innerHeight - h)),
    scale,
  };
}

function loadTransform(aspect: number): PetTransform {
  try {
    const raw = localStorage.getItem(TRANSFORM_KEY);
    if (raw) return clampTransform(JSON.parse(raw) as PetTransform, aspect);
  } catch { /* ignore */ }
  return defaultTransform(aspect);
}

function saveTransform(t: PetTransform) {
  try { localStorage.setItem(TRANSFORM_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

interface DesktopPetProps {
  /** 今日 AC 题数;拿到数据后桌宠会主动说一句对应台词 */
  todaySolved?: number;
}

export default function DesktopPet({ todaySolved }: DesktopPetProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const managerRef = useRef<CharacterManager | null>(null);
  const viewRef = useRef<Live2DView | null>(null);

  // 容器宽高比跟随模型(模型加载后更新),放大不会被固定框裁切
  const [aspect, setAspect] = useState(FALLBACK_ASPECT);
  // ref 镜像供稳定回调(如 resize 监听)读取,渲染期不写 ref
  const aspectRef = useRef(FALLBACK_ASPECT);
  useEffect(() => { aspectRef.current = aspect; }, [aspect]);

  // 组件经 dynamic ssr:false 挂载,首帧就在客户端 → 直接惰性恢复,
  // 不能用"先渲染占位再换真身"的两阶段方案(会让渲染层捕获到被卸载的 canvas)
  const [transform, setTransform] = useState<PetTransform>(() => loadTransform(FALLBACK_ASPECT));
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [currentName, setCurrentName] = useState<string>("");
  const [ready, setReady] = useState(false);
  /** 左侧功能区当前展开的面板 */
  const [panel, setPanel] = useState<null | "chars" | "import" | "settings">(null);
  /** 锁定:锁定后不可拖动、不可滚轮缩放(点击互动不受影响);右键桌宠快捷切换 */
  const [locked, setLocked] = useState<boolean>(() => {
    try { return localStorage.getItem(LOCKED_KEY) === "1"; } catch { return false; }
  });
  /** 当前模型的表情列表(交互面板用) */
  const [expressions, setExpressions] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; ts: number } | null>(null);

  const say = useCallback((text: string) => {
    if (text) setMessage({ text, ts: Date.now() });
  }, []);

  /* ---- 初始化:建渲染层 → 加载角色 ---- */
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const view = new Live2DView(wrap, canvas);
    viewRef.current = view;
    const manager = new CharacterManager(view);
    managerRef.current = manager;

    let cancelled = false;
    (async () => {
      const list = await fetchCharacters();
      if (cancelled) return;
      setCharacters(list);
      const loaded = await manager.loadCharacter(list).catch((e) => {
        console.warn("[DesktopPet] 角色加载失败:", e);
        return null;
      });
      if (!cancelled && loaded) {
        setCurrentName(loaded.name);
        setReady(true);
        setExpressions(view.listExpressions());
        // 模型就绪 → 容器比例贴合模型,并把位置重新夹回视口
        const a = view.modelAspect;
        if (a) {
          setAspect(a);
          setTransform((t) => clampTransform(t, a));
        }
      }
    })();

    // 窗口缩放时把桌宠夹回视口内
    const onResize = () => setTransform((t) => clampTransform(t, aspectRef.current));
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      manager.dispose();
      managerRef.current = null;
      viewRef.current = null;
    };
  }, []);

  /* ---- 今日刷题数就绪 → 主动说一句(每次数值变化只说一次) ---- */
  const lastSolvedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || todaySolved == null) return;
    if (lastSolvedRef.current === todaySolved) return;
    lastSolvedRef.current = todaySolved;
    say(getTaskDialogue(todaySolved));
  }, [ready, todaySolved, say]);

  /* ---- 拖动(区分点击):指针按下记录起点,超过阈值进入拖动 ---- */
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; dragging: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // transform 恒有值(惰性初始化)
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: transform.x, baseY: transform.y, dragging: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || locked) return; // 锁定时不进入拖动,点击互动不受影响
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.dragging = true;
    setTransform((t) => {
      const next = clampTransform({ ...t, x: d.baseX + dx, y: d.baseY + dy }, aspectRef.current);
      return next;
    });
  };
  /* 抬起统一在 capture 阶段处理:
   * setPointerCapture 会把指针事件重定向到容器,canvas 收不到,
   * 所以点击命中(tapAt)也从这里派发 */
  const onPointerUpCapture = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return; // 起点不在容器上(如设置按钮已 stopPropagation),忽略
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d.dragging) {
      // 拖动结束:按最终落点持久化(不能在 setState updater 里做副作用)
      if (transform) {
        const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
        saveTransform(clampTransform({ ...transform, x: d.baseX + dx, y: d.baseY + dy }, aspectRef.current));
      }
    } else {
      // 真点击:命中判定 → 触摸台词
      const area = viewRef.current?.tapAt(e.clientX, e.clientY);
      if (area) say(getRandomTouchDialogue(area));
    }
  };

  /* ---- 滚轮缩放(锁定时同样禁用) ---- */
  const onWheel = (e: React.WheelEvent) => {
    if (locked) return;
    setTransform((t) => {
      const next = clampTransform({ ...t, scale: t.scale * (e.deltaY < 0 ? 1.08 : 0.92) }, aspectRef.current);
      saveTransform(next);
      return next;
    });
  };

  const handleSwitch = async (c: CharacterInfo) => {
    setPanel(null);
    if (c.name === currentName) return;
    try {
      await managerRef.current?.switchCharacter(c);
      setCurrentName(c.name);
      setExpressions(viewRef.current?.listExpressions() ?? []);
      // 新模型比例可能不同,容器随之自适应
      const a = viewRef.current?.modelAspect;
      if (a) {
        setAspect(a);
        setTransform((t) => clampTransform(t, a));
      }
    } catch (e) {
      console.warn("[DesktopPet] 切换角色失败:", e);
    }
  };

  const handleResetPosition = () => {
    const t = defaultTransform(aspectRef.current);
    setTransform(t);
    saveTransform(t);
    setPanel(null);
  };

  /* ---- 导入模型 zip → 上传解压 → 刷新列表并切换过去 ---- */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    const name = file.name.replace(/\.zip$/i, "").trim();
    setImporting(true);
    setImportError("");
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("name", name);
      const resp = await fetch("/api/live2d/import", { method: "POST", body: data });
      const json = await resp.json();
      if (!resp.ok) { setImportError(json.error || "导入失败"); return; }
      const list = await fetchCharacters();
      setCharacters(list);
      const imported = list.find((c) => c.name === json.name);
      if (imported) await handleSwitch(imported);
      setPanel(null);
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  };

  /* ---- 表情交互:播表情 + 说挂钩台词(expressions.json) ---- */
  const handleExpression = (name: string) => {
    viewRef.current?.setExpression(name);
    say(getExpressionDialogue(name));
  };

  /* ---- 位置锁定:面板开关 + 右键桌宠快捷切换 ---- */
  const toggleLocked = useCallback(() => {
    setLocked((v) => {
      const next = !v;
      try { localStorage.setItem(LOCKED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      setMessage({ text: next ? "位置和大小已锁定(右键解锁)" : "位置和大小已解锁", ts: Date.now() });
      return next;
    });
  }, []);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // 拦截浏览器右键菜单,用作锁定开关
    toggleLocked();
  };

  const handleSavePosition = () => {
    saveTransform(transform);
    say("这个位置记住啦~");
  };

  const { w, h } = petSize(transform.scale, aspect);

  return (
    <div
      className="group fixed z-40 select-none"
      style={{ left: transform.x, top: transform.y, width: w, height: h, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUpCapture={onPointerUpCapture}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >
      <Bubble message={message} />

      {/* 渲染容器:canvas 由 Live2DView 接管 */}
      <div ref={wrapRef} className="w-full h-full cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* ---- 左侧功能条:换角色 / 导入模型 / 表情互动 / 归位 ---- */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 right-full mr-1.5 flex flex-col gap-1.5 transition-opacity ${panel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ToolButton icon="👤" title="更换角色" active={panel === "chars"} onClick={() => setPanel(panel === "chars" ? null : "chars")} />
        <ToolButton icon="📥" title="导入模型(zip)" active={panel === "import"} onClick={() => setPanel(panel === "import" ? null : "import")} />
        <ToolButton icon="⚙" title="设置" active={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")} />
      </div>

      {/* 面板弹层:开在功能条更左侧 */}
      {panel && (
        <div
          className="absolute top-0 right-full mr-10 w-44 max-h-full overflow-y-auto rounded-lg py-1.5 shadow-lg text-xs z-20"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {panel === "chars" && (
            <>
              <div className="px-3 py-1 text-[10px] text-muted-foreground">更换角色</div>
              {characters.map((c) => (
                <button
                  key={c.name}
                  onClick={() => handleSwitch(c)}
                  className={`w-full text-left px-3 py-1.5 transition-colors hover:bg-[var(--surface-bg)] ${c.name === currentName ? "font-semibold" : "text-foreground/70"}`}
                >
                  {c.name}
                  {c.name === currentName && <span className="ml-1 text-[10px]" style={{ color: "var(--accent-text)" }}>●</span>}
                </button>
              ))}
            </>
          )}

          {panel === "import" && (
            <div className="px-3 py-2 space-y-2">
              <div className="text-[10px] text-muted-foreground">导入模型</div>
              <p className="text-[10px] leading-relaxed text-foreground/60">
                选择模型 zip(含 *.model3.json 或 *.model.json),角色名取自文件名。
              </p>
              <input ref={importFileRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />
              <button
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="w-full px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
              >
                {importing ? "导入中..." : "选择 zip 文件"}
              </button>
              {importError && <div className="text-[10px] text-red-400 break-all">{importError}</div>}
            </div>
          )}

          {panel === "settings" && (
            <div className="px-3 py-2 space-y-2">
              <div className="text-[10px] text-muted-foreground">设置</div>
              <div className="text-[10px] text-foreground/60 tabular-nums leading-relaxed">
                坐标 ({Math.round(transform.x)}, {Math.round(transform.y)})<br />
                缩放 {transform.scale.toFixed(2)}x
              </div>
              <button
                onClick={toggleLocked}
                className="w-full px-3 py-1.5 rounded-md text-left transition-colors hover:bg-[var(--surface-bg)]"
                style={locked ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : { color: "var(--foreground)" }}
              >
                {locked ? "🔒 已锁定(点击解锁)" : "🔓 锁定位置与大小"}
              </button>
              <button
                onClick={handleSavePosition}
                className="w-full px-3 py-1.5 rounded-md text-left text-foreground/70 transition-colors hover:bg-[var(--surface-bg)]"
              >
                💾 保存当前位置
              </button>
              <button
                onClick={handleResetPosition}
                className="w-full px-3 py-1.5 rounded-md text-left text-foreground/70 transition-colors hover:bg-[var(--surface-bg)]"
              >
                ⌂ 重置位置
              </button>
              <p className="text-[9px] leading-relaxed text-muted-foreground/70">
                提示:在桌宠上点右键可快捷锁定/解锁
              </p>
              <div className="pt-1 border-t" style={{ borderColor: "var(--card-border)" }}>
                <div className="text-[10px] text-muted-foreground py-1">表情互动</div>
                {expressions.length === 0 ? (
                  <div className="py-1 text-foreground/50">当前模型没有表情</div>
                ) : (
                  expressions.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleExpression(name)}
                      className="w-full text-left px-2 py-1.5 rounded-md text-foreground/70 transition-colors hover:bg-[var(--surface-bg)]"
                    >
                      {name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon, title, active, onClick }: { icon: string; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-all hover:scale-110"
      style={{
        background: active ? "var(--accent-soft)" : "var(--card-bg)",
        border: `1px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
      }}
    >
      {icon}
    </button>
  );
}
