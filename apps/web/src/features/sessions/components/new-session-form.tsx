"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BeeRegisteredRepo, BeeSession, BeeSessionMode } from "@/lib/bee/types";

import { startSessionAction } from "../api/actions";
import { CHAT_OPTION, RepoCombobox } from "./repo-combobox";

/** Permission modes (V2.5) — same menu as Claude Code in VSCode. */
export const MODE_OPTIONS: { value: BeeSessionMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Full tools, no prompts — V1 behavior" },
  { value: "plan", label: "Plan", hint: "Read-only: explores and presents a plan" },
  { value: "edits", label: "Edits", hint: "Edits files freely; other tools ask first" },
  { value: "manual", label: "Manual", hint: "Every tool asks — approve from the chat" },
];

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
  repos: BeeRegisteredRepo[];
  onCreated?: (session: BeeSession) => void;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(repos[0]?.slug ?? CHAT_OPTION);
  const [mode, setMode] = useState<BeeSessionMode>("auto");
  const [err, setErr] = useState("");
  const [isOpen, startOpen] = useTransition();

  const isChat = chosen === CHAT_OPTION;

  function opener() {
    if (isOpen) return;
    startOpen(async () => {
      const outcome = await startSessionAction({ repoSlug: isChat ? null : chosen, mode });
      if (!outcome.ok) {
        setErr(outcome.message);
        return;
      }
      setErr("");
      if (onCreated && outcome.session !== null) {
        onCreated(outcome.session);
        router.refresh();
      } else {
        router.push(`/sessions/${outcome.id}`);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        opener();
      }}
    >
      {/* min-w-0: without it the flex child's min-width is the FULL repo
          name, which shoves the button past the card edge on canvas. */}
      <div className="min-w-0 flex-1">
        <RepoCombobox repos={repos} value={chosen} onChange={setChosen} />
      </div>
      {/* Mode như menu VSCode — phiên chat không tool nên không có mode. */}
      {!isChat && (
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as BeeSessionMode)}
          aria-label="Session mode"
          title={MODE_OPTIONS.find((m) => m.value === mode)?.hint}
          className="h-9 rounded-control border border-border bg-transparent px-2 font-mono text-sm text-body"
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )}
      {/* Terracotta like the send button — the shadcn default (white in
          dark) read as unstyled next to the VSCode skin. */}
      <Button
        type="submit"
        disabled={isOpen}
        className="bg-[#C15F3C] text-white hover:bg-[#a94f31]"
      >
        {isOpen ? "Starting…" : isChat ? "New chat" : "New session"}
      </Button>
      {err !== "" && <p className="text-xs text-destructive sm:ml-2">{err}</p>}
    </form>
  );
}
