"use client";

import { ArrowUpIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-dot";
import type { BeeSession } from "@/lib/bee/types";

import { dungPhienAction, guiVaoPhien, okLamDiAction } from "../api/actions";
import { useSessionStream } from "../hooks/use-session-stream";
import { EventStream } from "./event-stream";

/**
 * Màn live: dòng sự kiện + ô gõ dính đáy + nút Dừng luôn thấy. Mobile-first —
 * đây là màn hình được PRD gọi là quan trọng nhất.
 *
 * Câu vừa gõ hiện qua đường stream (bee_user_say do action ghi sổ, SSE nhặt
 * trong ≤ 500ms) — một nguồn sự thật duy nhất, không lo hiện đúp.
 */
export function LiveView({ phien }: { phien: BeeSession }) {
  const { suKien, dangGo, dangNghi, trangThai, ketThuc, boQua } = useSessionStream(phien.id);
  const [nhap, setNhap] = useState("");
  const [loi, setLoi] = useState("");
  const [okDaBam, setOkDaBam] = useState(phien.phase === "work");
  const [dangGui, batDauGui] = useTransition();

  const dangChay = ketThuc === null;

  function gui() {
    const text = nhap.trim();
    if (text === "" || dangGui) return;
    batDauGui(async () => {
      const ket = await guiVaoPhien(phien.id, text);
      if (ket.ok) {
        setNhap("");
        setLoi("");
      } else {
        setLoi(ket.message);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* thanh trạng thái */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
        <StatusDot tone={ketThuc === null ? "agent" : ketThuc === "done" ? "ok" : "down"} />
        <span className="font-mono text-xs text-muted-foreground">
          {phien.repo} · bee/{phien.slug}-{phien.num}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {ketThuc === null ? (okDaBam ? "working" : "interview") : ketThuc}
        </span>
        <span className="flex-1" />
        {dangChay && !okDaBam && (
          <Button
            size="sm"
            onClick={() => {
              setOkDaBam(true);
              void okLamDiAction(phien.id);
            }}
          >
            OK, do it
          </Button>
        )}
        {dangChay && (
          <Button size="sm" variant="outline" onClick={() => void dungPhienAction(phien.id)}>
            Stop
          </Button>
        )}
      </div>

      {boQua > 0 && (
        <p className="border-b border-border px-4 py-1.5 font-mono text-xs text-muted-foreground sm:px-6">
          Skipped {boQua} earlier events — showing the most recent.
        </p>
      )}
      {trangThai === "mat-ket-noi" && dangChay && (
        <p className="border-b border-border px-4 py-1.5 font-mono text-xs text-destructive sm:px-6">
          Connection lost — retrying…
        </p>
      )}

      {/* dòng sự kiện */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {suKien.length === 0 && dangGo === "" && dangNghi === "" ? (
          <p className="text-sm text-muted-foreground">
            {trangThai === "dang-noi" ? "Connecting…" : "Waiting for the session to speak…"}
          </p>
        ) : (
          <EventStream suKien={suKien} dangGo={dangGo} dangNghi={dangNghi} />
        )}
      </div>

      {/* ô gõ — hộp bo tròn kiểu Claude Code, nút gửi ↑ màu đất nung */}
      <div className="p-3 sm:p-4">
        {dangChay ? (
          <form
            className="rounded-panel border border-border bg-card px-3 py-2 focus-within:border-muted-foreground/40"
            onSubmit={(e) => {
              e.preventDefault();
              gui();
            }}
          >
            <Textarea
              value={nhap}
              onChange={(e) => setNhap(e.target.value)}
              placeholder={okDaBam ? "Say something to the agent…" : "Describe your idea — the agent will interview you"}
              aria-label="Message to the agent"
              rows={2}
              className="min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  gui();
                }
              }}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {okDaBam ? "working" : "interview"}
              </span>
              <span className="flex-1" />
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={dangGui || nhap.trim() === ""}
                className="size-7 rounded-full bg-[#C15F3C] text-white hover:bg-[#a94f31] disabled:opacity-40"
              >
                <ArrowUpIcon className="size-4" />
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Session ended ({ketThuc}). Open a new session to continue this conversation.
          </p>
        )}
        {loi !== "" && <p className="mt-1 text-xs text-destructive">{loi}</p>}
      </div>
    </div>
  );
}
