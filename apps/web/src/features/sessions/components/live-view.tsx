"use client";

import {
  ArrowUpIcon,
  ClipboardListIcon,
  HandIcon,
  SquareIcon,
  SquarePenIcon,
  ZapIcon,
} from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-dot";
import type { BeeSession, BeeSessionMode, BeeSessionModel } from "@/lib/bee/types";

import {
  doiModeAction,
  doiModelAction,
  dungPhienAction,
  guiVaoPhien,
  tiepTucAction,
  traLoiQuyenAction,
  uploadFileAction,
} from "../api/actions";
import { useSessionStream } from "../hooks/use-session-stream";
import { EventStream } from "./event-stream";
import { ActionsPanel, MODEL_OPTIONS, PlusMenu } from "./input-actions";
import { MODE_OPTIONS } from "./new-session-form";

/** Touch screens get Enter-as-newline; only keyboard-first devices send on Enter. */
const isCoarsePointer = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

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
 * (evidence-first) → demo/preview. Tapping a chip PICKS its command as the
 * message prefix — nothing is sent until the user hits send, so they can
 * add context after the command without reaching for the "/" key
 * (changed 23/08: chips used to send "/name" immediately). A chip only
 * renders when its command actually exists on the machine (~/.claude/commands).
 */
const CHIP_FLOW = [
  { lenh: "issue", nhan: "Issue" },
  { lenh: "build", nhan: "Build" },
  { lenh: "review", nhan: "Review" },
  { lenh: "pr", nhan: "PR" },
  { lenh: "demo", nhan: "Demo" },
  { lenh: "preview", nhan: "Preview" },
];

/**
 * Built-ins the CLI itself understands over stream-json input (proven by
 * probe 23/08: "/compact" is answered by the CLI, not the model). They have
 * no command file on the machine, so the palette adds them by hand; the
 * server-side expander passes unknown names through untouched.
 */
const BUILTIN_COMMANDS = [
  { name: "compact", moTa: "Compact the conversation — frees context, keeps the gist" },
];

const MODE_ICONS: Record<BeeSessionMode, typeof ZapIcon> = {
  auto: ZapIcon,
  plan: ClipboardListIcon,
  edits: SquarePenIcon,
  manual: HandIcon,
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
  const [model, setModel] = useState<BeeSessionModel>(phien.model ?? "default");

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

  /** Model switch: optimistic like the mode one, and it restarts the unit too. */
  function doiModel(moi: BeeSessionModel) {
    if (dangDoiMode || moi === model) return;
    batDauDoiMode(async () => {
      const truoc = model;
      setModel(moi);
      const ket = await doiModelAction(phien.id, moi);
      if (!ket.ok) {
        setModel(truoc);
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

  // The command currently picked as the message prefix ("/issue hãy…" → "issue").
  const pickedCommand = nhap.startsWith("/") ? (nhap.slice(1).split(/\s/)[0] ?? "") : null;

  /** Put "/name " in front of the draft, replacing any current command prefix. */
  function insertCommand(name: string) {
    setNhap(`/${name} ${nhap.replace(/^\/\S+\s*/, "")}`);
  }

  /**
   * Chip tap picks the command as the prefix — nothing is sent. Tapping the
   * same chip unpicks it; tapping another swaps the prefix. The message body
   * the user already typed survives either way.
   */
  function pickCommand(name: string) {
    if (pickedCommand === name) setNhap(nhap.replace(/^\/\S+\s*/, ""));
    else insertCommand(name);
  }

  /** Send a line straight to the session — palette actions like /compact. */
  function sendDirect(text: string) {
    if (dangGui) return;
    batDauGui(async () => {
      const ket = await guiVaoPhien(phien.id, text);
      setLoi(ket.ok ? "" : ket.message);
    });
  }

  /** "+" upload: the file lands in the worktree, its path lands in the draft. */
  function handleUpload(f: File) {
    batDauGui(async () => {
      const fd = new FormData();
      fd.append("file", f);
      const ket = await uploadFileAction(phien.id, fd);
      if (ket.ok && ket.relPath !== undefined) {
        setLoi("");
        const ghi = `[attached: ${ket.relPath}]`;
        setNhap((v) => (v === "" ? `${ghi} ` : `${v}\n${ghi}`));
      } else {
        setLoi(ket.message);
      }
    });
  }

  const coChuMoi = nhap.trim() !== "";

  // "/..." opens the palette: the machine's global COMMANDS (expanded
  // server-side on send, REPL-style — picking one keeps "/name " in the
  // box for arguments). It only shows while the COMMAND token is being
  // typed — once a space lands the user is writing the message body and
  // the palette would just cover the chat. No tools → no palette.
  const tatCaLenh = [...commands, ...BUILTIN_COMMANDS].map((c) => ({
    ten: `/${c.name}`,
    moTa: c.moTa,
    chen: `/${c.name} `,
  }));
  const goiLenh =
    phien.worktree && nhap.startsWith("/") && !nhap.includes(" ")
      ? tatCaLenh.filter((l) => l.ten.startsWith(nhap)).slice(0, 12)
      : [];

  // Flow chips: only the ones whose command the machine actually has.
  const coLenh = new Set(commands.map((c) => c.name));
  const chips = phien.worktree ? CHIP_FLOW.filter((c) => coLenh.has(c.lenh)) : [];

  // V2.4 — the flow's next step glows: no issue yet → Issue; issue but no
  // PR → Build; PR open → Preview. Read from the artifact events the
  // session itself logged (replay-truncated history may miss old ones —
  // a wrong glow is a nudge, not a gate).
  const coIssue = suKien.some((s) => s.loai === "artifact" && s.kind === "issue");
  const coPR = suKien.some((s) => s.loai === "artifact" && s.kind === "pr");
  const goiY = !coIssue ? "issue" : !coPR ? "build" : "preview";

  // An approval card without an answer = the ball is in the OWNER's court.
  const daTraLoi = new Set(
    suKien.filter((s) => s.loai === "quyen-da-tra-loi").map((s) => s.requestId),
  );
  const dangChoQuyen = suKien.some(
    (s) => s.loai === "xin-quyen" && !daTraLoi.has(s.requestId),
  );

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
            // Shimmer says "the AGENT is working" — while an approval card
            // waits for the OWNER, showing it would be a lie.
            dangCho={dangBan && dangGo === "" && dangNghi === "" && !dangChoQuyen}
            onTraLoiQuyen={(requestId, choPhep, inputJson) =>
              batDauGui(async () => {
                const ket = await traLoiQuyenAction(phien.id, requestId, choPhep, inputJson);
                if (!ket.ok) setLoi(ket.message);
              })
            }
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
                aria-label={`Use /${c.lenh}`}
                aria-pressed={c.lenh === pickedCommand}
                data-suggested={c.lenh === goiY || undefined}
                onClick={() => pickCommand(c.lenh)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs hover:bg-accent ${
                  c.lenh === pickedCommand
                    ? "border-[#C15F3C] bg-[#C15F3C]/25 text-body"
                    : c.lenh === goiY
                      ? "border-[#C15F3C]/70 bg-[#C15F3C]/10 text-body"
                      : "border-border bg-secondary text-body"
                }`}
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
                // On phones Enter is a plain newline — only the ↑ button sends.
                if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
                  e.preventDefault();
                  gui();
                }
              }}
            />
            <div className="mt-1.5 flex items-center gap-2">
              {/* Attach needs a worktree to put the file in; the actions
                  panel does not — a chat session still picks its model. */}
              {phien.worktree && <PlusMenu disabled={dangGui} onUpload={handleUpload} />}
              <ActionsPanel
                commands={phien.worktree ? [...commands, ...BUILTIN_COMMANDS] : []}
                mode={phien.worktree ? mode : null}
                model={model}
                onInsertCommand={insertCommand}
                onCompact={() => sendDirect("/compact")}
                onStop={() => void dungPhienAction(phien.id)}
                onPickMode={doiMode}
                onPickModel={doiModel}
              />
              {model !== "default" && (
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {MODEL_OPTIONS.find((m) => m.value === model)?.label}
                </span>
              )}
              {nguCanh !== null && (
                <VongNguCanh phanTram={nguCanh} dung={nguCanhDung} cua={nguCanhCua} />
              )}
              {nguCanh !== null && nguCanh >= 90 && (
                <span className="text-xs text-destructive">
                  almost full — auto-compact soon, or send /compact
                </span>
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
          // V2.6: continuing IS possible — start = resume, same conversation.
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Session ended ({ketThuc}).</p>
            <Button
              size="sm"
              variant="outline"
              disabled={dangGui}
              onClick={() =>
                batDauGui(async () => {
                  const ket = await tiepTucAction(phien.id);
                  if (ket.ok) {
                    // Full reload: the SSE stream closed on bee_done — a
                    // fresh page reattaches it to the resumed session.
                    window.location.reload();
                  } else {
                    setLoi(ket.message);
                  }
                })
              }
            >
              {dangGui ? "Continuing…" : "Continue session"}
            </Button>
          </div>
        )}
        {loi !== "" && <p className="mt-1 text-xs text-destructive">{loi}</p>}
      </div>
    </div>
  );
}
