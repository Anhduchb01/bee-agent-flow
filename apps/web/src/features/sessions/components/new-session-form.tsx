"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BeeRepoDangKy, BeeSession } from "@/lib/bee/types";

import { batDauPhien } from "../api/actions";
import { CHAT_OPTION, RepoCombobox } from "./repo-combobox";

/**
 * "New session" — chọn repo ĐÃ ĐĂNG KÝ (repos.d, doctor kiểm được) hoặc
 * "No repo — just chat". Không có ô gõ repo tự do: repo mới phải đăng ký
 * trước (PAT phủ + branch protection) — ma sát có chủ đích, đúng chỗ.
 *
 * No title field: the session starts untitled and the FIRST chat message
 * names it (auto-title in session-ctl), like Claude Code names sessions.
 *
 * Phiên có repo LUÔN có worktree ngay từ đầu — interview đứng trong repo,
 * "OK, do it" chỉ là chuyển chế độ đã chứng minh, không có bài nâng cấp.
 *
 * `onCreated` cho canvas mở panel tại chỗ; không có thì đi sang trang phiên.
 */
export function NewSessionForm({
  repos,
  onCreated,
}: {
  repos: BeeRepoDangKy[];
  onCreated?: (phien: BeeSession) => void;
}) {
  const router = useRouter();
  const [chon, setChon] = useState(repos[0]?.slug ?? CHAT_OPTION);
  const [loi, setLoi] = useState("");
  const [dangMo, batDauMo] = useTransition();

  const laChat = chon === CHAT_OPTION;

  function mo() {
    if (dangMo) return;
    batDauMo(async () => {
      const ket = await batDauPhien({ repoSlug: laChat ? null : chon });
      if (!ket.ok) {
        setLoi(ket.message);
        return;
      }
      setLoi("");
      if (onCreated && ket.phien !== null) {
        onCreated(ket.phien);
        router.refresh();
      } else {
        router.push(`/sessions/${ket.id}`);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        mo();
      }}
    >
      <div className="flex-1">
        <RepoCombobox repos={repos} value={chon} onChange={setChon} />
      </div>
      {/* Terracotta like the send button — the shadcn default (white in
          dark) read as unstyled next to the VSCode skin. */}
      <Button
        type="submit"
        disabled={dangMo}
        className="bg-[#C15F3C] text-white hover:bg-[#a94f31]"
      >
        {dangMo ? "Starting…" : laChat ? "New chat" : "New session"}
      </Button>
      {loi !== "" && <p className="text-xs text-destructive sm:ml-2">{loi}</p>}
    </form>
  );
}
