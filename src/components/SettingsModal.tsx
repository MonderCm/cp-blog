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
}

type Tab = "profile" | "background";

export default function SettingsModal({
  isOpen,
  onClose,
  profile,
  onSave,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [form, setForm] = useState<UserProfile>(() => profile);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setForm(profile);
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
            <div className="card p-6">
              <div className="flex items-center gap-4 mb-6 pb-4" style={{ borderBottom: "1px solid var(--surface-border)" }}>
                <h2 className="text-lg font-semibold">设置</h2>
                <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-bg)" }}>
                  <button
                    onClick={() => setActiveTab("profile")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "profile"
                        ? ""
                        : "hover:text-foreground"
                    }`}
                    style={activeTab === "profile" ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : {}}
                  >个人资料</button>
                  <button
                    onClick={() => setActiveTab("background")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "background"
                        ? ""
                        : "hover:text-foreground"
                    }`}
                    style={activeTab === "background" ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : {}}
                  >网页背景</button>
                </div>
              </div>

              {activeTab === "background" ? (
                <BackgroundSettings onClose={handleClose} />
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">头像</label>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          <div
                            className="w-16 h-16 rounded-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group"
                            style={{ boxShadow: "0 0 0 1px var(--card-border)" }}
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
                            className="px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 self-start"
                            style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
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

                    <div className="pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
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
                      className="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                      style={{ background: "var(--surface-bg)" }}
                    >取消</button>
                    <button
                      onClick={handleSave}
                      className="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
                    >保存</button>
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
