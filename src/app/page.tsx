import Link from "next/link";
import { connection } from "next/server";
import { listUsers } from "@/lib/profile";

/** CF/NC rating 色（相同规则） */
function getCFNCColor(r: number): string {
  if (r < 1200) return "#999";
  if (r < 1400) return "#77ff77";
  if (r < 1600) return "#77ddbb";
  if (r < 1900) return "#aaaaff";
  if (r < 2100) return "#ff88ff";
  if (r < 2400) return "#ffcc88";
  return "#ff7777";
}
/** AtCoder rating 色 */
function getATCColor(r: number): string {
  if (r < 400) return "#808080";
  if (r < 800) return "#804000";
  if (r < 1200) return "#008000";
  if (r < 1600) return "#00c0c0";
  if (r < 2000) return "#0000ff";
  if (r < 2400) return "#c0c000";
  if (r < 2800) return "#ff8000";
  return "#ff0000";
}

/**
 * 首页 / —— 用户列表 + 新建用户入口
 * 每个用户独立主页在 /u/[slug]
 */
export default async function Home() {
  await connection();
  const users = await listUsers();

  return (
    <div className="max-w-6xl mx-auto px-6 pt-12 pb-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold mb-2">CP Blog</h1>
        <p className="text-sm text-muted-foreground">
          每个同学一个 slug,自己的算法进度自己看 ——{" "}
          <Link href="/new" className="text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline">
            新建主页 →
          </Link>
        </p>
      </header>

      {users.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">还没有用户,做第一个吧</p>
          <Link
            href="/new"
            className="inline-block px-4 py-2 text-sm rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors"
          >
            创建主页
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <Link
              key={u.slug}
              href={`/u/${u.slug}`}
              className="glass-card p-4 hover:bg-white/[0.04] transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u.avatar}
                  alt={u.name}
                  className="w-12 h-12 rounded-full object-cover ring-1 ring-white/10"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-indigo-300 transition-colors">
                    {u.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    /u/{u.slug}
                  </div>
                </div>
              </div>
              {u.bio && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{u.bio}</p>
              )}
              <div className="flex gap-2 text-[10px] font-mono">
                <RatingPill label="CF" value={u.cfRating} color={getCFNCColor(u.cfRating)} />
                <RatingPill label="AtC" value={u.atcRating} color={getATCColor(u.atcRating)} />
                <RatingPill label="NC" value={u.ncRating} color={getCFNCColor(u.ncRating)} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded bg-white/[0.04] flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      {value > 0 ? (
        <span style={{ color, fontWeight: 600 }}>{value}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
    </span>
  );
}
