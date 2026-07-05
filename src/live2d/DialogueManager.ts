/**
 * DialogueManager — 台词中心
 *
 * 所有台词来自 src/assets/dialogues/*.json,这里只做读取与随机挑选,
 * 不写死任何文案。后续接 AI 对话时,在这里加一个异步来源即可。
 */

import touchRaw from "@/assets/dialogues/touch.json";
import taskRaw from "@/assets/dialogues/task.json";
import expressionsRaw from "@/assets/dialogues/expressions.json";
import type { HitArea, TaskRule, TouchDialogues } from "./types";

const touch = touchRaw as TouchDialogues;
const task = taskRaw as TaskRule[];
/** 表情名 → 台词;"_default" 为未配置表情的兜底 */
const expressions = expressionsRaw as Record<string, string[]>;

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? "";
}

/** 点击部位 → 随机一句触摸台词 */
export function getRandomTouchDialogue(area: HitArea): string {
  return pick(touch[area] ?? []);
}

/** 今日刷题数 → 按 task.json 的分段规则随机一句 */
export function getTaskDialogue(todaySolved: number): string {
  const rule = task.find((r) => todaySolved >= r.min && todaySolved <= r.max);
  return rule ? pick(rule.texts) : "";
}

/** 表情名 → 挂钩台词(expressions.json;未配置的走 _default) */
export function getExpressionDialogue(name: string): string {
  return pick(expressions[name] ?? expressions["_default"] ?? []);
}
