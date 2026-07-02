import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROFILE_FIELD_DEFAULTS } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * 首页 / → 直接跳转到最近活跃的用户主页
 * 无用户时自动创建默认用户（handle 在设置里改）
 */
export default async function Home() {
  await connection();
  const user = await prisma.user
    .findFirst({ orderBy: { updatedAt: "desc" }, select: { slug: true } })
    .catch(() => null);

  if (user) {
    redirect(`/u/${user.slug}`);
  }

  const created = await prisma.user.create({
    data: { slug: "home", ...PROFILE_FIELD_DEFAULTS },
    select: { slug: true },
  });
  redirect(`/u/${created.slug}`);
}
