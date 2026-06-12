import { notFound } from "next/navigation";
import { connection } from "next/server";
import HomePageClient from "@/components/HomePageClient";
import { getUserBySlug, isValidSlug } from "@/lib/profile";

/**
 * /u/[slug] —— 用户主页。slug 不存在 → 404
 */
export default async function UserPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;

  if (!isValidSlug(slug)) notFound();
  const user = await getUserBySlug(slug);
  if (!user) notFound();

  return <HomePageClient profile={user} />;
}
