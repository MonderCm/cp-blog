import { NextResponse } from "next/server";
import { listUsers } from "@/lib/profile";

/** 首页用:列出所有注册用户(按最近更新排序) */
export async function GET() {
  const users = await listUsers();
  return NextResponse.json({ users });
}
