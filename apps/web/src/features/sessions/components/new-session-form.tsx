"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { batDauPhien } from "../api/actions";

/**
 * "New session" — hai ô, một nút. Không phải form 5 mục của mô hình cũ:
 * chi tiết task sẽ ra đời TRONG cuộc phỏng vấn, không phải ở đây.
 */
export function NewSessionForm() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [title, setTitle] = useState("");
  const [loi, setLoi] = useState("");
  const [dangMo, batDauMo] = useTransition();

  function mo() {
    if (dangMo) return;
    batDauMo(async () => {
      const ket = await batDauPhien({ repo, title });
      if (ket.ok) {
        router.push(`/sessions/${ket.id}`);
      } else {
        setLoi(ket.message);
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
        className="font-mono sm:max-w-56"
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to build?"
        aria-label="Session title"
        className="flex-1"
      />
      <Button type="submit" disabled={dangMo || repo.trim() === ""}>
        {dangMo ? "Starting…" : "New session"}
      </Button>
      {loi !== "" && <p className="text-xs text-destructive sm:ml-2">{loi}</p>}
    </form>
  );
}
