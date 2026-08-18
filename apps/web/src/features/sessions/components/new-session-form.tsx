"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BeeSession } from "@/lib/bee/types";

import { batDauPhien } from "../api/actions";

/**
 * "New session" — hai ô, một checkbox, một nút. Không phải form 5 mục của mô
 * hình cũ: chi tiết task ra đời TRONG cuộc phỏng vấn, không phải ở đây.
 *
 * Bỏ tick "worktree" là mở PHIÊN CHAT: không clone, không branch, không bao
 * giờ có tool — hỏi đáp nhanh không phải trả tiền fetch.
 *
 * `onCreated` cho canvas mở panel tại chỗ; không có thì đi sang trang phiên.
 */
export function NewSessionForm({
  repos = [],
  onCreated,
}: {
  repos?: string[];
  onCreated?: (phien: BeeSession) => void;
}) {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [title, setTitle] = useState("");
  const [worktree, setWorktree] = useState(true);
  const [loi, setLoi] = useState("");
  const [dangMo, batDauMo] = useTransition();

  function mo() {
    if (dangMo) return;
    batDauMo(async () => {
      const ket = await batDauPhien({ repo, title, worktree });
      if (!ket.ok) {
        setLoi(ket.message);
        return;
      }
      setLoi("");
      setRepo("");
      setTitle("");
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
      <Input
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        placeholder="owner/repo"
        aria-label="Repository"
        list={repos.length > 0 ? "bee-repos" : undefined}
        className="font-mono sm:max-w-56"
      />
      {repos.length > 0 && (
        <datalist id="bee-repos">
          {repos.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      )}
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to build?"
        aria-label="Session title"
        className="flex-1"
      />
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={worktree}
          onChange={(e) => setWorktree(e.target.checked)}
          className="size-3.5 accent-[#C15F3C]"
        />
        worktree
      </label>
      <Button type="submit" disabled={dangMo || repo.trim() === ""}>
        {dangMo ? "Starting…" : worktree ? "New session" : "New chat"}
      </Button>
      {loi !== "" && <p className="text-xs text-destructive sm:ml-2">{loi}</p>}
    </form>
  );
}
