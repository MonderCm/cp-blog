"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import BackgroundSettings from "./BackgroundSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    avatar: string;
    name: string;
    bio: string;
    signature: string;
    location: string;
    cfUsername: string;
    atcUsername: string;
  };
  onSave: (data: {
    avatar: string;
    name: string;
    bio: string;
    signature: string;
    location: string;
    cfUsername: string;
    atcUsername: string;
  }) => void;
}

type Tab = "profile" | "background";

export default function SettingsModal({
  isOpen,
  onClose,
  profile,
  onSave,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [form, setForm] = useState(profile);

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
            onClick={onClose}
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
                <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab("profile")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "profile"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "hover:bg-white/[0.06]"
                    }`}
                  >
                    个人资料
                  </button>
                  <button
                    onClick={() => setActiveTab("background")}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      activeTab === "background"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "hover:bg-white/[0.06]"
                    }`}
                  >
                    网页背景
                  </button>
                </div>
              </div>

              {activeTab === "background" ? (
                <BackgroundSettings onClose={onClose} />
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        头像 URL
                      </label>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 rounded-full overflow-hidden ring-1 ring-white/[0.08]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={form.avatar}
                              alt="预览"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                        <div className="flex-1">
                          <input
                            type="url"
                            value={form.avatar}
                            onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                            placeholder="https://..."
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            支持 Gravatar、GitHub 头像等公开 URL
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        用户名
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        个人简介
                      </label>
                      <input
                        type="text"
                        value={form.bio}
                        onChange={(e) => setForm({ ...form, bio: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        个性签名
                      </label>
                      <input
                        type="text"
                        value={form.signature}
                        onChange={(e) =>
                          setForm({ ...form, signature: e.target.value })
                        }
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="一句简短的话"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        位置
                      </label>
                      <input
                        type="text"
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="北京"
                      />
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs text-muted-foreground mb-3">
                        竞赛平台账号
                      </p>

                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">
                            Codeforces 用户名
                          </label>
                          <input
                            type="text"
                            value={form.cfUsername}
                            onChange={(e) =>
                              setForm({ ...form, cfUsername: e.target.value })
                            }
                            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
                            placeholder="tourist"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">
                            AtCoder 用户名
                          </label>
                          <input
                            type="text"
                            value={form.atcUsername}
                            onChange={(e) =>
                              setForm({ ...form, atcUsername: e.target.value })
                            }
                            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
                            placeholder="tourist"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={onClose}
                      className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex-1 px-4 py-2 text-sm rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors"
                    >
                      保存
                    </button>
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