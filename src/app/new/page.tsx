"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * 新建用户页 —— 填写昵称 + 三平台 handle，POST /api/profile 自动生成 slug 后跳转
 */
export default function NewUserPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    cfHandle: "",
    atcHandle: "",
    ncHandle: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const name = form.name.trim();
    if (!name) {
      setError("昵称不能为空");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cfHandle: form.cfHandle.trim(),
          atcHandle: form.atcHandle.trim(),
          ncHandle: form.ncHandle.trim(),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "创建失败");
        setSubmitting(false);
        return;
      }

      const { slug } = await res.json();
      router.push(`/u/${slug}`);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 pt-16 pb-16">
      <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        ← 返回首页
      </Link>
      <h1 className="text-2xl font-semibold mt-4 mb-2">创建主页</h1>
      <p className="text-sm text-muted-foreground mb-6">
        创建一个属于你的个人主页，绑定竞赛平台账号后自动同步数据。
      </p>

      <form onSubmit={submit} className="glass-card p-5 space-y-4">
        <Field label="昵称 (必填)">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="给自己起个名字"
            className="input"
            required
          />
        </Field>
        <Field label="Codeforces handle">
          <input
            value={form.cfHandle}
            onChange={(e) => setForm({ ...form, cfHandle: e.target.value })}
            placeholder="可选，例如 tourist"
            className="input font-mono"
          />
        </Field>
        <Field label="AtCoder handle">
          <input
            value={form.atcHandle}
            onChange={(e) => setForm({ ...form, atcHandle: e.target.value })}
            placeholder="可选"
            className="input font-mono"
          />
        </Field>
        <Field label="牛客 UID">
          <input
            value={form.ncHandle}
            onChange={(e) => setForm({ ...form, ncHandle: e.target.value })}
            placeholder="可选"
            className="input font-mono"
          />
        </Field>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 text-sm rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors disabled:opacity-50"
        >
          {submitting ? "创建中..." : "创建主页"}
        </button>
      </form>

      <style jsx>{`
        .input {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: inherit;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
