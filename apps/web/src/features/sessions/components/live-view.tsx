"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-dot";
import type { BeeSession } from "@/lib/bee/types";

import { dungPhienAction, guiVaoPhien } from "../api/actions";
import { useSessionStream } from "../hooks/use-session-stream";
import { EventStream } from "./event-stream";

/** VSCode's chat font stack — the panel should read like the editor's chat. */
const VSCODE_FONT =
  "'Segoe WPC', 'Segoe UI', system-ui, -apple-system, 'Ubuntu', 'Droid Sans', sans-serif";

/**
 * Slash palette, VSCode-style. Real CC slash commands live in the REPL
 * input layer and do NOT pass through stream-json — so each entry expands
 * to an instruction that triggers the matching global bee skill instead.
 */
const LENH = [
  {
    ten: "/issue",
    moTa: "Create a GitHub issue from this session",
    chen: "Dùng skill bee-create-issue: tạo issue cho việc đang bàn trong phiên này.",
  },
  {
    ten: "/pr",
    moTa: "Push the bee/* branch and open a draft PR",
    chen: "Dùng skill bee-push-pr: push nhánh của phiên và mở draft pull request.",
  },
  {
    ten: "/update-pr",
    moTa: "Push new commits + summary comment to the open PR",
    chen: "Dùng skill bee-update-pr: đẩy commit mới lên PR của phiên và comment tóm tắt thay đổi.",
  },
];

/**
 * Context-fill ring, VSCode style: a small circle that fills as the
 * window fills. Only rendered once a result carried real numbers.
 */
function VongNguCanh({ phanTram }: { phanTram: number }) {
  const r = 6;
  const chuVi = 2 * Math.PI * r;
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Context ${phanTram}% full`}
      aria-label={`Context ${phanTram}% full`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={chuVi}
          strokeDashoffset={chuVi * (1 - Math.min(phanTram, 100) / 100)}
          className={phanTram >= 80 ? "text-destructive" : "text-muted-foreground"}
        />
      </svg>
      <span className="font-mono text-xs text-muted-foreground">{phanTram}%</span>
    </span>
  );
}

/**
 * Màn live: dòng sự kiện + ô gõ dính đáy. Mobile-first — đây là màn hình
 * được PRD gọi là quan trọng nhất.
 *
 * One mode only (chốt 19/08): a repo session is a normal chat WITH tools
 * from the first message — no interview gate, no "OK, do it". Issues/PRs
 * the agent creates surface as artifact nodes on the canvas.
 *
 * Câu vừa gõ hiện qua đường stream (bee_user_say do action ghi sổ, SSE nhặt
 * trong ≤ 500ms) — một nguồn sự thật duy nhất, không lo hiện đúp.
 */
export function LiveView({ phien }: { phien: BeeSession }) {
  const { suKien, dangGo, dangNghi, trangThai, ketThuc, boQua } = useSessionStream(phien.id);
  const [nhap, setNhap] = useState("");
  const [loi, setLoi] = useState("");
  const [dangGui, batDauGui] = useTransition();

  const dangChay = ketThuc === null;

  // Busy = the agent owes an answer: the last user message sits after the
  // last result, or text/thinking is streaming right now.
  const sauCung = { noi: -1, ketQua: -1 };
  suKien.forEach((s, i) => {
    if (s.loai === "nguoi-noi") sauCung.noi = i;
    if (s.loai === "ket-qua") sauCung.ketQua = i;
  });
  const dangBan = dangChay && (sauCung.noi > sauCung.ketQua || dangGo !== "" || dangNghi !== "");

  // Latest context fill — from the newest result that carried numbers.
  let nguCanh: number | null = null;
  for (let i = suKien.length - 1; i >= 0; i--) {
    const s = suKien[i]!;
    if (s.loai === "ket-qua" && typeof s.nguCanh === "number") {
      nguCanh = s.nguCanh;
      break;
    }
  }

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

  const coChuMoi = nhap.trim() !== "";

  // "/..." opens the palette; picking one replaces the box with the skill
  // trigger for the user to edit or send. Chat sessions have no tools —
  // no palette there.
  const goiLenh =
    phien.worktree && nhap.startsWith("/")
      ? LENH.filter((l) => l.ten.startsWith(nhap.trim().split(" ")[0] ?? ""))
      : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: VSCODE_FONT }}>
      {/* thanh trạng thái */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
        <StatusDot tone={ketThuc === null ? "agent" : ketThuc === "done" ? "ok" : "down"} />
        <span className="font-mono text-xs text-muted-foreground">
          {phien.repo} · {phien.worktree ? `bee/${phien.slug}-${phien.num}` : "chat"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {ketThuc === null ? (dangBan ? "working…" : "idle") : ketThuc}
        </span>
        <span className="flex-1" />
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

      {/* ô gõ — hộp bo tròn kiểu Claude Code; nút đổi vai theo trạng thái */}
      <div className="p-3 sm:p-4">
        {dangChay ? (
          <form
            className="relative rounded-panel border border-border bg-card px-3 py-2 focus-within:border-muted-foreground/40"
            onSubmit={(e) => {
              e.preventDefault();
              gui();
            }}
          >
            {goiLenh.length > 0 && (
              <ul
                role="listbox"
                aria-label="Commands"
                className="absolute bottom-full left-0 mb-1 w-full rounded-card border border-border bg-card p-1 shadow-md"
              >
                {goiLenh.map((l) => (
                  <li key={l.ten} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => setNhap(l.chen)}
                      className="flex w-full items-baseline gap-2 rounded-control px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="font-mono text-sm text-body">{l.ten}</span>
                      <span className="text-xs text-muted-foreground">{l.moTa}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              value={nhap}
              onChange={(e) => setNhap(e.target.value)}
              placeholder={
                !phien.worktree
                  ? "Ask anything — this chat has no tools and touches no code"
                  : "Say something to the agent…"
              }
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
              {nguCanh !== null && <VongNguCanh phanTram={nguCanh} />}
              <span className="flex-1" />
              {dangBan && !coChuMoi ? (
                // Running and nothing new typed → the button is Stop, like
                // VSCode. Typing flips it back to send (the message queues).
                <Button
                  type="button"
                  size="icon"
                  aria-label="Stop session"
                  onClick={() => void dungPhienAction(phien.id)}
                  className="size-7 rounded-full bg-destructive text-white hover:bg-destructive/80"
                >
                  <SquareIcon className="size-3" fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={dangGui || !coChuMoi}
                  className="size-7 rounded-full bg-[#C15F3C] text-white hover:bg-[#a94f31] disabled:opacity-40"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              )}
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
