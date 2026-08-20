"use client";

import { ArrowUpIcon, ClipboardListIcon, SquareIcon, SquarePenIcon, ZapIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-dot";
import type { BeeSession, BeeSessionMode } from "@/lib/bee/types";

import { doiModeAction, dungPhienAction, guiVaoPhien } from "../api/actions";
import { useSessionStream } from "../hooks/use-session-stream";
import { EventStream } from "./event-stream";
import { MODE_OPTIONS } from "./new-session-form";

/** VSCode's chat font stack — the panel should read like the editor's chat. */
const VSCODE_FONT =
  "'Segoe WPC', 'Segoe UI', system-ui, -apple-system, 'Ubuntu', 'Droid Sans', sans-serif";

/**
 * VSCode Dark Modern, scoped to the chat: overriding the theme's CSS vars
 * here re-skins every descendant (cards, borders, code chips) to the exact
 * editor palette without touching the rest of the app.
 */
const VSCODE_SKIN = {
  fontFamily: VSCODE_FONT,
  "--background": "#1f1f1f",
  "--card": "#1f1f1f",
  "--popover": "#202020",
  "--secondary": "#252526",
  "--muted": "#313131",
  "--accent": "#2a2d2e",
  "--input": "#3c3c3c",
  "--border": "#2b2b2b",
  "--foreground": "#cccccc",
  "--body": "#cccccc",
  "--card-foreground": "#cccccc",
  "--accent-foreground": "#cccccc",
  "--muted-foreground": "#9d9d9d",
  "--font-mono": "'Cascadia Code', 'Consolas', 'SF Mono', Menlo, monospace",
} as React.CSSProperties;

/**
 * The task flow as tap-first chips: idea → issue → build → review → PR
 * (evidence-first) → demo/preview. Each chip IS a global command — tapping
 * sends "/name" through the same server-side expansion as typing it, so
 * phone users never have to reach for the "/" key. A chip only renders
 * when its command actually exists on the machine (~/.claude/commands).
 */
const CHIP_FLOW = [
  { lenh: "issue", nhan: "Issue" },
  { lenh: "build", nhan: "Build" },
  { lenh: "review", nhan: "Review" },
  { lenh: "pr", nhan: "PR" },
  { lenh: "demo", nhan: "Demo" },
  { lenh: "preview", nhan: "Preview" },
];

const MODE_ICONS: Record<BeeSessionMode, typeof ZapIcon> = {
  auto: ZapIcon,
  plan: ClipboardListIcon,
  edits: SquarePenIcon,
};

/**
 * VSCode-style mode menu, docked by the send button: "⚡ Auto" opens an
 * upward panel listing each mode with its one-line description, current
 * one checked. Switching restarts the agent under the hood (--resume, the
 * conversation is kept).
 */
function ModeMenu({
  mode,
  disabled,
  onPick,
}: {
  mode: BeeSessionMode;
  disabled: boolean;
  onPick: (m: BeeSessionMode) => void;
}) {
  const [mo, setMo] = useState(false);
  const Icon = MODE_ICONS[mode];
  const hienTai = MODE_OPTIONS.find((m) => m.value === mode);
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setMo(false);
      }}
    >
      <button
        type="button"
        aria-label="Session mode"
        aria-haspopup="menu"
        aria-expanded={mo}
        disabled={disabled}
        onClick={() => setMo((x) => !x)}
        title="Switch permission mode — the agent restarts and resumes this conversation"
        className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent hover:text-body disabled:opacity-40"
      >
        <Icon className="size-3.5" />
        {hienTai?.label}
      </button>
      {mo && (
        <div
          role="menu"
          aria-label="Session modes"
          className="absolute right-0 bottom-full z-20 mb-2 w-72 rounded-card border border-border bg-popover p-1 shadow-md"
        >
          {MODE_OPTIONS.map((m) => {
            const MIcon = MODE_ICONS[m.value];
            return (
              <button
                key={m.value}
                type="button"
                role="menuitemradio"
                aria-checked={m.value === mode}
                onClick={() => {
                  setMo(false);
                  onPick(m.value);
                }}
                className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-accent"
              >
                <MIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-body">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.moTa}</span>
                </span>
                {m.value === mode && <span className="text-sm text-body">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 104635 → "105k", 1000000 → "1M" — the ring's numbers must scan fast. */
function tomTatToken(n: number): string {
  if (n >= 1_000_000) {
    const trieu = n / 1_000_000;
    return `${Number.isInteger(trieu) ? trieu : trieu.toFixed(1)}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * Context-fill ring, VSCode style: a small circle that fills as the
 * window fills. Only rendered once a result carried real numbers.
 * Shows the RAW tokens next to the % — "10%" alone reads as a bug when
 * the window is 1M and the system prompt + skills already cost ~100k.
 */
function VongNguCanh({
  phanTram,
  dung = null,
  cua = null,
}: {
  phanTram: number;
  dung?: number | null;
  cua?: number | null;
}) {
  const r = 6;
  const chuVi = 2 * Math.PI * r;
  const soLieu = dung !== null && cua !== null ? `${tomTatToken(dung)}/${tomTatToken(cua)}` : null;
  const nhan =
    soLieu === null
      ? `Context ${phanTram}% full`
      : `Context ${phanTram}% full — ${soLieu} tokens`;
  return (
    <span className="inline-flex items-center gap-1" title={nhan} aria-label={nhan}>
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
      <span className="font-mono text-xs text-muted-foreground">
        {phanTram}%{soLieu !== null && <span className="hidden sm:inline"> · {soLieu}</span>}
      </span>
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
export function LiveView({
  phien,
  commands = [],
}: {
  phien: BeeSession;
  /** Global slash commands (~/.claude/commands) — the "/" palette. */
  commands?: { name: string; moTa: string }[];
}) {
  const { suKien, dangGo, dangNghi, trangThai, ketThuc, boQua } = useSessionStream(phien.id);
  const [nhap, setNhap] = useState("");
  const [loi, setLoi] = useState("");
  const [dangGui, batDauGui] = useTransition();
  // Optimistic — the prop only refreshes on a server re-render.
  const [mode, setMode] = useState<BeeSessionMode>(phien.mode ?? "auto");
  const [dangDoiMode, batDauDoiMode] = useTransition();

  function doiMode(moi: BeeSessionMode) {
    if (dangDoiMode || moi === mode) return;
    batDauDoiMode(async () => {
      const truoc = mode;
      setMode(moi);
      const ket = await doiModeAction(phien.id, moi);
      if (!ket.ok) {
        setMode(truoc);
        setLoi(ket.message);
      }
    });
  }

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
  let nguCanhDung: number | null = null;
  let nguCanhCua: number | null = null;
  for (let i = suKien.length - 1; i >= 0; i--) {
    const s = suKien[i]!;
    if (s.loai === "ket-qua" && typeof s.nguCanh === "number") {
      nguCanh = s.nguCanh;
      nguCanhDung = typeof s.dungToken === "number" ? s.dungToken : null;
      nguCanhCua = typeof s.cuaSoToken === "number" ? s.cuaSoToken : null;
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

  /** Chip tap = the command is SENT, not typed — that is the whole point. */
  function guiLenh(lenh: string) {
    if (dangGui) return;
    batDauGui(async () => {
      const ket = await guiVaoPhien(phien.id, `/${lenh}`);
      setLoi(ket.ok ? "" : ket.message);
    });
  }

  const coChuMoi = nhap.trim() !== "";

  // "/..." opens the palette: the machine's global COMMANDS (expanded
  // server-side on send, REPL-style — picking one keeps "/name " in the
  // box for arguments). Chat sessions have no tools — no palette there.
  const tatCaLenh = commands.map((c) => ({
    ten: `/${c.name}`,
    moTa: c.moTa,
    chen: `/${c.name} `,
  }));
  const goiLenh =
    phien.worktree && nhap.startsWith("/")
      ? tatCaLenh
          .filter((l) => l.ten.startsWith(nhap.trim().split(" ")[0] ?? ""))
          .slice(0, 12)
      : [];

  // Flow chips: only the ones whose command the machine actually has.
  const coLenh = new Set(commands.map((c) => c.name));
  const chips = phien.worktree ? CHIP_FLOW.filter((c) => coLenh.has(c.lenh)) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-body" style={VSCODE_SKIN}>
      {/* thanh trạng thái */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
        <StatusDot tone={ketThuc === null ? "agent" : ketThuc === "done" ? "ok" : "down"} />
        {/* min-w-0 + truncate: repo · branch is the longest string on the
            bar — on a phone it must give way, never push Stop off-screen. */}
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {phien.repo} · {phien.worktree ? `bee/${phien.slug}-${phien.num}` : "chat"}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
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
          <EventStream
            suKien={suKien}
            dangGo={dangGo}
            dangNghi={dangNghi}
            dangCho={dangBan && dangGo === "" && dangNghi === ""}
          />
        )}
      </div>

      {/* ô gõ — hộp bo tròn kiểu Claude Code; nút đổi vai theo trạng thái */}
      <div className="p-3 sm:p-4">
        {/* Action chips: the whole flow tappable — no "/" typing on a phone.
            One scrollable row so six chips never wrap the input area taller. */}
        {dangChay && chips.length > 0 && (
          <div
            role="toolbar"
            aria-label="Session actions"
            className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chips.map((c) => (
              <button
                key={c.lenh}
                type="button"
                aria-label={`Run /${c.lenh}`}
                disabled={dangGui}
                onClick={() => guiLenh(c.lenh)}
                className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-body hover:bg-accent disabled:opacity-40"
              >
                {c.nhan}
              </button>
            ))}
          </div>
        )}
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
                className="absolute bottom-full left-0 mb-1 max-h-72 w-full overflow-y-auto rounded-card border border-border bg-popover p-1 shadow-md"
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
              {nguCanh !== null && (
                <VongNguCanh phanTram={nguCanh} dung={nguCanhDung} cua={nguCanhCua} />
              )}
              <span className="flex-1" />
              {phien.worktree && (
                <ModeMenu mode={mode} disabled={dangDoiMode} onPick={doiMode} />
              )}
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
