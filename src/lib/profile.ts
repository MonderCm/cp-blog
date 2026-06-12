import { prisma } from "@/lib/prisma";

/**
 * 多用户站点的用户资料(原 Profile 单例已并入 User 表)
 * slug 是 URL 标识,谁拿到 slug 谁能编辑(无登录)
 */
export interface UserProfile {
  slug: string;
  avatar: string;
  name: string;
  bio: string;
  signature: string;
  location: string;
  cfHandle: string;
  atcHandle: string;
  ncHandle: string;
}

export interface UserListItem extends UserProfile {
  cfRating: number;
  atcRating: number;
  ncRating: number;
  updatedAt: string;
}

/** 字段默认值——DB 不可达时回退 + SettingsModal placeholder */
export const PROFILE_FIELD_DEFAULTS: Omit<UserProfile, "slug"> = {
  avatar: "/uploads/avatars/default.svg",
  name: "anonymous",
  bio: "",
  signature: "代码改变世界",
  location: "",
  cfHandle: "",
  atcHandle: "",
  ncHandle: "",
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$|^[a-z0-9]$/;

/** slug 规则:1-32 字符,小写字母/数字/短横线,首尾不能是横线 */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** 把任意字符串规范化成合法 slug,失败返回 null */
export function normalizeSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return s && isValidSlug(s) ? s : null;
}

/** 按 slug 读用户;不存在返回 null。失败也返回 null(让上层走 404) */
export async function getUserBySlug(slug: string): Promise<UserProfile | null> {
  try {
    const u = await prisma.user.findUnique({ where: { slug } });
    if (!u) return null;
    return {
      slug: u.slug,
      avatar: u.avatar,
      name: u.name,
      bio: u.bio,
      signature: u.signature,
      location: u.location,
      cfHandle: u.cfHandle,
      atcHandle: u.atcHandle,
      ncHandle: u.ncHandle,
    };
  } catch (e) {
    console.warn(`[user] getUserBySlug(${slug}) failed:`, e);
    return null;
  }
}

/** 列出所有用户(主页用),失败返回空数组保证 UI 不崩 */
export async function listUsers(): Promise<UserListItem[]> {
  try {
    const rows = await prisma.user.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return rows.map((u) => ({
      slug: u.slug,
      avatar: u.avatar,
      name: u.name,
      bio: u.bio,
      signature: u.signature,
      location: u.location,
      cfHandle: u.cfHandle,
      atcHandle: u.atcHandle,
      ncHandle: u.ncHandle,
      cfRating: u.cfRating,
      atcRating: u.atcRating,
      ncRating: u.ncRating,
      updatedAt: u.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.warn("[user] listUsers failed:", e);
    return [];
  }
}
