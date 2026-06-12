"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import BackgroundSettings from "./BackgroundSettings";
import type { UserProfile } from "@/lib/profile";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSave: (data: UserProfile) => void;
  onDelete: () => void;
}

type Tab = "profile" | "background";

export default function SettingsModal({
  isOpen,
  onClose,
  profile,
  onSave,
  onDelete,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [form, setForm] = useState<UserProfile>(() => profile);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setForm(profile);
    setDeleteConfirm(false);
    onClose();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("slug", profile.slug);
      const res = await fetch("/api/upload-avatar", { method: "POST", body: data });
      const json = await res.json();
      if (json.url) {
        setForm({ ...form, avatar: json.url });
      } else {
        alert(json.error || "上传失败");
      }
    } catch {
      alert("上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/profile?slug=${encodeURIComponent(profile.slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "删除失败");
        return;
      }
      onDelete();
    } catch {
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="glass-card p-6">
              <div className="flex items-center gap-4 mb-6 border-b border-white/[0.06] pb-4">
                <h2 className="text-lg font-semibold">设置</h2>
                <div className="flex gap-1 bg-white/[0.02] rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab("profile")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "profile"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >个人资料</button>
                  <button
                    onClick={() => setActiveTab("background")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "background"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >网页背景</button>
                </div>
              </div>

              {activeTab === "background" ? (
                <BackgroundSettings onClose={handleClose} />
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-white/[0.02] rounded px-2 py-1.5">
                      <span>slug:</span>
                      <code className="font-mono text-indigo-300">{profile.slug}</code>
                      <span className="ml-auto opacity-60">不可修改</span>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">头像</label>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          <div
                            className="w-16 h-16 rounded-full overflow-hidden ring-1 ring-white/[0.08] cursor-pointer hover:opacity-80 transition-opacity relative group"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.avatar} alt="预览" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">更换</div>
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors disabled:opacity-50 self-start"
                          >{uploading ? "上传中..." : "选择本地图片"}</button>
                          <p className="text-[10px] text-muted-foreground mt-1">支持 JPG、PNG、GIF,最大 5MB</p>
                        </div>
                      </div>
                    </div>

                    <Field label="昵称">
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="modal-input"
                      />
                    </Field>

                    <Field label="个人简介">
                      <input
                        type="text"
                        value={form.bio}
                        onChange={(e) => setForm({ ...form, bio: e.target.value })}
                        className="modal-input"
                      />
                    </Field>

                    <Field label="个性签名">
                      <input
                        type="text"
                        value={form.signature}
                        onChange={(e) => setForm({ ...form, signature: e.target.value })}
                        className="modal-input"
                        placeholder="一句简短的签名"
                      />
                    </Field>

                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs text-muted-foreground mb-3">竞赛平台账号</p>

                      <div className="space-y-3">
                        <Field label="Codeforces handle">
                          <input
                            type="text"
                            value={form.cfHandle}
                            onChange={(e) => setForm({ ...form, cfHandle: e.target.value })}
                            className="modal-input font-mono"
                            placeholder="tourist"
                          />
                        </Field>

                        <Field label="AtCoder handle">
                          <input
                            type="text"
                            value={form.atcHandle}
                            onChange={(e) => setForm({ ...form, atcHandle: e.target.value })}
                            className="modal-input font-mono"
                            placeholder="tourist"
                          />
                        </Field>

                        <Field label="牛客网 UID">
                          <input
                            type="text"
                            value={form.ncHandle}
                            onChange={(e) => setForm({ ...form, ncHandle: e.target.value })}
                            className="modal-input font-mono"
                            placeholder="123456"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleClose}
                      className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                    >取消</button>
                    <button
                      onClick={handleSave}
                      className="flex-1 px-4 py-2 text-sm rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors"
                    >保存</button>
                  </div>

                  <div className="border-t border-white/[0.06] mt-6 pt-4">
                    {!deleteConfirm ? (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="w-full px-4 py-2 text-sm rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      >删除主页</button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-red-400 text-center">确定要删除这个主页吗？所有数据将被永久清除，不可恢复。</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setDeleteConfirm(false)}
                            className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                          >取消</button>
                          <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors disabled:opacity-50"
                          >{deleting ? "删除中..." : "确认删除"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
