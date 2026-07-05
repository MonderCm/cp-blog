/**
 * Live2DView — Pixi 渲染层
 *
 * 职责:初始化 Pixi、把模型挂到画布、把点击换算成 HitArea 事件。
 * 不含任何业务逻辑(台词、气泡、持久化都在上层)。
 *
 * 运行时说明:Cubism 2/4 的 runtime 脚本自托管在 public/live2d/,
 * 且必须在 import pixi-live2d-display 之前加载(库在模块求值时探测全局)。
 */

import type { HitArea } from "./types";

const RUNTIME_URLS = ["/live2d/live2d.min.js", "/live2d/live2dcubismcore.min.js"];

/* 模块级去重:运行时脚本全局只加载一次 */
let runtimePromise: Promise<void> | null = null;
function loadRuntimes(): Promise<void> {
  if (!runtimePromise) {
    runtimePromise = Promise.all(
      RUNTIME_URLS.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`runtime load failed: ${src}`));
            document.head.appendChild(s);
          })
      )
    ).then(() => undefined).catch((e) => { runtimePromise = null; throw e; });
  }
  return runtimePromise;
}

/* pixi-live2d-display 的模型实例(避免引入其复杂类型,这里收窄到用到的成员) */
interface L2DModel {
  scale: { set: (v: number) => void } | null;
  anchor: { set: (x: number, y: number) => void };
  position: { set: (x: number, y: number) => void };
  internalModel: {
    width: number;
    height: number;
    settings?: { expressions?: { Name?: string; name?: string }[] };
    motionManager?: { expressionManager?: { resetExpression?: () => void } };
  };
  motion: (group: string) => unknown;
  expression: (nameOrIndex?: string | number) => unknown;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface PixiAppLike {
  stage: { addChild: (m: unknown) => void; removeChild: (m: unknown) => void };
  resize: () => void;
  destroy: (removeView?: boolean, opts?: object) => void;
}

export class Live2DView {
  private app: PixiAppLike | null = null;
  private model: L2DModel | null = null;
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ro: ResizeObserver | null = null;
  private destroyed = false;

  constructor(wrap: HTMLElement, canvas: HTMLCanvasElement) {
    this.wrap = wrap;
    this.canvas = canvas;
  }

  /** 初始化 Pixi(幂等,只跑一次) */
  async init(): Promise<void> {
    if (this.app) return;
    await loadRuntimes();
    const PIXI = await import("pixi.js");
    // pixi-live2d-display 的自动更新循环依赖全局 PIXI
    (window as unknown as { PIXI: unknown }).PIXI = PIXI;

    const app = new PIXI.Application({
      view: this.canvas,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: this.wrap,
    });
    this.app = app as unknown as PixiAppLike;

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.wrap);
  }

  /**
   * 点击命中判定 + 播放反馈动作,返回命中的部位。
   * 注意由上层(容器)调用,不在 canvas 上挂监听——上层用了 setPointerCapture,
   * 指针事件会被重定向到容器,canvas 自己收不到。
   * 模型普遍缺 hit_areas 定义(miku 就没有),用相对坐标兜底:上 1/3 head,其余 body。
   */
  tapAt(clientX: number, clientY: number): HitArea | null {
    if (!this.model || this.destroyed) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.height === 0) return null;
    const relY = (clientY - rect.top) / rect.height;
    const area: HitArea = relY < 1 / 3 ? "head" : "body";
    // 反馈:有动作播动作,有表情随机换一个表情(如 14酱 这类纯表情模型)
    try { this.model.motion("Idle"); } catch { /* ignore */ }
    if (this.listExpressions().length > 0) this.setExpression();
    return area;
  }

  /** 加载并显示模型(替换当前模型) */
  async loadModel(modelUrl: string): Promise<void> {
    await this.init();
    const { Live2DModel } = await import("pixi-live2d-display");
    const model = (await Live2DModel.from(modelUrl, { autoInteract: true })) as unknown as L2DModel;
    if (this.destroyed) { model.destroy(); return; }
    this.unloadModel();
    this.model = model;
    this.app!.stage.addChild(model);
    this.fit();
  }

  /** 当前模型的宽高比(width/height),无模型时为 null;上层用它让容器自适应 */
  get modelAspect(): number | null {
    const m = this.model;
    if (!m || !m.internalModel.height) return null;
    return m.internalModel.width / m.internalModel.height;
  }

  /** 当前模型声明的全部表情名(model3.json 的 FileReferences.Expressions) */
  listExpressions(): string[] {
    const exps = this.model?.internalModel.settings?.expressions ?? [];
    return exps.map((e) => e.Name ?? e.name ?? "").filter(Boolean);
  }

  /** 播放指定表情;不传则随机一个。模型无表情时静默忽略。
   * 切换前先重置上一个表情——Add 混合的参数会残留叠加,这就是"残影"的来源 */
  setExpression(name?: string): void {
    if (!this.model) return;
    try { this.model.internalModel.motionManager?.expressionManager?.resetExpression?.(); } catch { /* ignore */ }
    try { this.model.expression(name); } catch { /* ignore */ }
  }

  /** 卸载当前模型(切换角色时用) */
  unloadModel(): void {
    if (this.model) {
      try {
        this.app?.stage.removeChild(this.model);
        this.model.destroy();
      } catch { /* ignore */ }
      this.model = null;
    }
  }

  /** contain 缩放 + 底部居中,窗口/容器变化时重算 */
  private fit(): void {
    const m = this.model;
    if (!m || this.destroyed || !m.scale) return;
    // pixi v6 的 resizeTo 只监听 window resize,容器自身变化(如滚轮缩放桌宠)
    // 不会触发缓冲区重建 → 必须手动 resize,否则模型画出缓冲区被裁切
    try { this.app?.resize(); } catch { /* ignore */ }
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    const scale = Math.min(w / m.internalModel.width, h / m.internalModel.height);
    m.scale.set(scale);
    m.anchor.set(0.5, 1);
    m.position.set(w / 2, h);
  }

  dispose(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    this.unloadModel();
    try { this.app?.destroy(false, { children: true, texture: true, baseTexture: true }); } catch { /* ignore */ }
    this.app = null;
  }
}
