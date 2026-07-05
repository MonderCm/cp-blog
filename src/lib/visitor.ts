import { cookies } from "next/headers";
import { isValidSlug } from "@/lib/profile";

/**
 * 访客身份:首次访问 / 时创建用户并种下 cookie(见 app/route.ts)
 * 写接口用 cookie slug 与目标 slug 比对做所有权校验
 */
export const VISITOR_COOKIE = "visitor";

/** 当前请求的访客 slug;cookie 缺失或非法返回 "" */
export async function getVisitorSlug(): Promise<string> {
  const store = await cookies();
  const v = store.get(VISITOR_COOKIE)?.value ?? "";
  return isValidSlug(v) ? v : "";
}
