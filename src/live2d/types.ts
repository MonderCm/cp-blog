/**
 * Live2D 桌宠公共类型定义
 */

/** 可点击部位 */
export type HitArea = "head" | "body";

/** 一个可用角色(由 /api/live2d/characters 扫描 public/live2d/characters/ 得到) */
export interface CharacterInfo {
  /** 目录名,也是角色唯一标识,如 "miku" */
  name: string;
  /** 模型入口 JSON 的 URL,如 /live2d/characters/miku/assets/miku.model.json */
  modelUrl: string;
}

/** 触摸台词配置(src/assets/dialogues/touch.json) */
export interface TouchDialogues {
  head: string[];
  body: string[];
}

/** 按今日刷题数分段的台词规则(src/assets/dialogues/task.json) */
export interface TaskRule {
  min: number;
  max: number;
  texts: string[];
}

/** 桌宠位置与缩放的持久化状态 */
export interface PetTransform {
  /** 视口内 left 像素 */
  x: number;
  /** 视口内 top 像素 */
  y: number;
  /** 0.5 ~ 2 */
  scale: number;
}
