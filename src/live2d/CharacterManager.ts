/**
 * CharacterManager — 角色生命周期
 *
 * 职责:获取可用角色列表、加载/切换/卸载角色、记住上次选择。
 * 角色由 public/live2d/characters/ 目录驱动(见 /api/live2d/characters),
 * 新增角色 = 新增一个模型目录,前端零改动。
 */

import { Live2DView } from "./Live2DView";
import type { CharacterInfo } from "./types";

const STORAGE_KEY = "cp-pet:character";

/** 拉取可用角色列表(服务端扫描目录) */
export async function fetchCharacters(): Promise<CharacterInfo[]> {
  try {
    const resp = await fetch("/api/live2d/characters");
    if (!resp.ok) return [];
    return (await resp.json()) as CharacterInfo[];
  } catch {
    return [];
  }
}

export class CharacterManager {
  private view: Live2DView;
  private current: CharacterInfo | null = null;

  constructor(view: Live2DView) {
    this.view = view;
  }

  get currentCharacter(): CharacterInfo | null {
    return this.current;
  }

  /** 加载角色:优先 localStorage 记住的,否则列表第一个 */
  async loadCharacter(characters: CharacterInfo[]): Promise<CharacterInfo | null> {
    if (characters.length === 0) return null;
    let target = characters[0];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const hit = characters.find((c) => c.name === saved);
      if (hit) target = hit;
    } catch { /* ignore */ }
    await this.switchCharacter(target);
    return target;
  }

  /** 运行时切换角色(无需刷新页面) */
  async switchCharacter(character: CharacterInfo): Promise<void> {
    await this.view.loadModel(character.modelUrl);
    this.current = character;
    try { localStorage.setItem(STORAGE_KEY, character.name); } catch { /* ignore */ }
  }

  dispose(): void {
    this.view.dispose();
    this.current = null;
  }
}
