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
import type { BeeSlice } from "@/lib/bee/services-fs";

import { SessionServices } from "./session-services";
import type { BeeSession, BeeSessionMode, BeeSessionModel } from "@/lib/bee/types";

import {
  changeModeAction,
  changeModelAction,
  stopSessionAction,
  sendToSessionAction,
  continueAction,
  answerPermissionAction,
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
  { command: "issue", label: "Issue" },
  { command: "build", label: "Build" },
  { command: "review", label: "Review" },
  { command: "pr", label: "PR" },
  { command: "demo", label: "Demo" },
  { command: "preview", label: "Preview" },
];

/**
 * Built-ins the CLI itself understands over stream-json input (proven by
 * probe 23/08: "/compact" is answered by the CLI, not the model). They have
 * no command file on the machine, so the palette adds them by hand; the
 * server-side expander passes unknown names through untouched.
 */
const BUILTIN_COMMANDS = [
  { name: "compact", hint: "Compact the conversation — frees context, keeps the gist" },
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
  const [opener, setMo] = useState(false);
  const Icon = MODE_ICONS[mode];
  const current = MODE_OPTIONS.find((m) => m.value === mode);
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
        aria-expanded={opener}
        disabled={disabled}
        onClick={() => setMo((x) => !x)}
        title="Switch permission mode — the agent restarts and resumes this conversation"
        className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent hover:text-body disabled:opacity-40"
      >
        <Icon className="size-3.5" />
        {current?.label}
      </button>
      {opener && (
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
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
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
    const millions = n / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
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
function ContextRing({
  percentOf,
  stopIt = null,
  owner = null,
}: {
  percentOf: number;
  stopIt?: number | null;
  owner?: number | null;
}) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const figures = stopIt !== null && owner !== null ? `${tomTatToken(stopIt)}/${tomTatToken(owner)}` : null;
  const label =
    figures === null
      ? `Context ${percentOf}% full`
      : `Context ${percentOf}% full — ${figures} tokens`;
  return (
    <span className="inline-flex items-center gap-1" title={label} aria-label={label}>
      <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(percentOf, 100) / 100)}
          className={percentOf >= 80 ? "text-destructive" : "text-muted-foreground"}
        />
      </svg>
      <span className="font-mono text-xs text-muted-foreground">
        {percentOf}%{figures !== null && <span className="hidden sm:inline"> · {figures}</span>}
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
  session,
  commands = [],
  slice = null,
}: {
  session: BeeSession;
  /** Global slash commands (~/.claude/commands) — the "/" palette. */
  commands?: { name: string; hint: string }[];
  /** The service slice this session holds, if any (T15c4). */
  slice?: BeeSlice | null;
}) {
  const { events, typing, idle, status, ended, skipped } = useSessionStream(session.id);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [sending, batDauGui] = useTransition();
  // Optimistic — the prop only refreshes on a server re-render.
  const [mode, setMode] = useState<BeeSessionMode>(session.mode ?? "auto");
  const [changingMode, batDauDoiMode] = useTransition();
  const [model, setModel] = useState<BeeSessionModel>(session.model ?? "default");

  function switchMode(latest: BeeSessionMode) {
    if (changingMode || latest === mode) return;
    batDauDoiMode(async () => {
      const prev = mode;
      setMode(latest);
      const outcome = await changeModeAction(session.id, latest);
      if (!outcome.ok) {
        setMode(prev);
        setErr(outcome.message);
      }
    });
  }

  /** Model switch: optimistic like the mode one, and it restarts the unit too. */
  function switchModel(latest: BeeSessionModel) {
    if (changingMode || latest === model) return;
    batDauDoiMode(async () => {
      const prev = model;
      setModel(latest);
      const outcome = await changeModelAction(session.id, latest);
      if (!outcome.ok) {
        setModel(prev);
        setErr(outcome.message);
      }
    });
  }

  const running = ended === null;

  // Busy = the agent owes an answer: the last user message sits after the
  // last result, or text/thinking is streaming right now.
  const last = { speak: -1, result: -1 };
  events.forEach((s, i) => {
    if (s.kind === "nguoi-noi") last.speak = i;
    if (s.kind === "ket-qua") last.result = i;
  });
  const busy = running && (last.speak > last.result || typing !== "" || idle !== "");

  // Latest context fill — from the newest result that carried numbers.
  let contextTokens: number | null = null;
  let contextUsed: number | null = null;
  let contextOf: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const s = events[i]!;
    if (s.kind === "ket-qua" && typeof s.contextTokens === "number") {
      contextTokens = s.contextTokens;
      contextUsed = typeof s.validToken === "number" ? s.validToken : null;
      contextOf = typeof s.tokenWindow === "number" ? s.tokenWindow : null;
      break;
    }
  }

  function send() {
    const text = input.trim();
    if (text === "" || sending) return;
    batDauGui(async () => {
      const outcome = await sendToSessionAction(session.id, text);
      if (outcome.ok) {
        setInput("");
        setErr("");
      } else {
        setErr(outcome.message);
      }
    });
  }

  // The command currently picked as the message prefix ("/issue hãy…" → "issue").
  const pickedCommand = input.startsWith("/") ? (input.slice(1).split(/\s/)[0] ?? "") : null;

  /** Put "/name " in front of the draft, replacing any current command prefix. */
  function insertCommand(name: string) {
    setInput(`/${name} ${input.replace(/^\/\S+\s*/, "")}`);
  }

  /**
   * Chip tap picks the command as the prefix — nothing is sent. Tapping the
   * same chip unpicks it; tapping another swaps the prefix. The message body
   * the user already typed survives either way.
   */
  function pickCommand(name: string) {
    if (pickedCommand === name) setInput(input.replace(/^\/\S+\s*/, ""));
    else insertCommand(name);
  }

  /** Send a line straight to the session — palette actions like /compact. */
  function sendDirect(text: string) {
    if (sending) return;
    batDauGui(async () => {
      const outcome = await sendToSessionAction(session.id, text);
      setErr(outcome.ok ? "" : outcome.message);
    });
  }

  /** "+" upload: the file lands in the worktree, its path lands in the draft. */
  function handleUpload(f: File) {
    batDauGui(async () => {
      const fd = new FormData();
      fd.append("file", f);
      const outcome = await uploadFileAction(session.id, fd);
      if (outcome.ok && outcome.relPath !== undefined) {
        setErr("");
        const writer = `[attached: ${outcome.relPath}]`;
        setInput((v) => (v === "" ? `${writer} ` : `${v}\n${writer}`));
      } else {
        setErr(outcome.message);
      }
    });
  }

  const hasNewText = input.trim() !== "";

  // "/..." opens the palette: the machine's global COMMANDS (expanded
  // server-side on send, REPL-style — picking one keeps "/name " in the
  // box for arguments). It only shows while the COMMAND token is being
  // typed — once a space lands the user is writing the message body and
  // the palette would just cover the chat. No tools → no palette.
  const allCommands = [...commands, ...BUILTIN_COMMANDS].map((c) => ({
    name: `/${c.name}`,
    hint: c.hint,
    chen: `/${c.name} `,
  }));
  const goiLenh =
    session.worktree && input.startsWith("/") && !input.includes(" ")
      ? allCommands.filter((l) => l.name.startsWith(input)).slice(0, 12)
      : [];

  // Flow chips: only the ones whose command the machine actually has.
  const knownCommands = new Set(commands.map((c) => c.name));
  const chips = session.worktree ? CHIP_FLOW.filter((c) => knownCommands.has(c.command)) : [];

  // V2.4 — the flow's next step glows: no issue yet → Issue; issue but no
  // PR → Build; PR open → Preview. Read from the artifact events the
  // session itself logged (replay-truncated history may miss old ones —
  // a wrong glow is a nudge, not a gate).
  const coIssue = events.some((s) => s.kind === "artifact" && s.artifactKind === "issue");
  const coPR = events.some((s) => s.kind === "artifact" && s.artifactKind === "pr");
  const suggestion = !coIssue ? "issue" : !coPR ? "build" : "preview";

  // An approval card without an answer = the ball is in the OWNER's court.
  const answered = new Set(
    events.filter((s) => s.kind === "quyen-da-tra-loi").map((s) => s.requestId),
  );
  const awaitingPermission = events.some(
    (s) => s.kind === "xin-quyen" && !answered.has(s.requestId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-body" style={VSCODE_SKIN}>
      {/* thanh trạng thái */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
        <StatusDot tone={ended === null ? "agent" : ended === "done" ? "ok" : "down"} />
        {/* min-w-0 + truncate: repo · branch is the longest string on the
            bar — on a phone it must give way, never push Stop off-screen. */}
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {session.repo} · {session.worktree ? `bee/${session.slug}-${session.num}` : "chat"}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {ended === null ? (busy ? "working…" : "idle") : ended}
        </span>
        <span className="flex-1" />
        {/* Left of Stop on purpose: it answers "what am I about to stop". */}
        <SessionServices slice={slice} />
        {running && (
          <Button size="sm" variant="outline" onClick={() => void stopSessionAction(session.id)}>
            Stop
          </Button>
        )}
      </div>

      {skipped > 0 && (
        <p className="border-b border-border px-4 py-1.5 font-mono text-xs text-muted-foreground sm:px-6">
          Skipped {skipped} earlier events — showing the most recent.
        </p>
      )}
      {status === "mat-ket-noi" && running && (
        <p className="border-b border-border px-4 py-1.5 font-mono text-xs text-destructive sm:px-6">
          Connection lost — retrying…
        </p>
      )}

      {/* dòng sự kiện */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {events.length === 0 && typing === "" && idle === "" ? (
          <p className="text-sm text-muted-foreground">
            {status === "dang-noi" ? "Connecting…" : "Waiting for the session to speak…"}
          </p>
        ) : (
          <EventStream
            events={events}
            typing={typing}
            idle={idle}
            // Shimmer says "the AGENT is working" — while an approval card
            // waits for the OWNER, showing it would be a lie.
            waiting={busy && typing === "" && idle === "" && !awaitingPermission}
            onAnswerPermission={(requestId, allow, inputJson) =>
              batDauGui(async () => {
                const outcome = await answerPermissionAction(session.id, requestId, allow, inputJson);
                if (!outcome.ok) setErr(outcome.message);
              })
            }
          />
        )}
      </div>

      {/* ô gõ — hộp bo tròn kiểu Claude Code; nút đổi vai theo trạng thái */}
      <div className="p-3 sm:p-4">
        {/* Action chips: the whole flow tappable — no "/" typing on a phone.
            One scrollable row so six chips never wrap the input area taller. */}
        {running && chips.length > 0 && (
          <div
            role="toolbar"
            aria-label="Session actions"
            className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chips.map((c) => (
              <button
                key={c.command}
                type="button"
                aria-label={`Use /${c.command}`}
                aria-pressed={c.command === pickedCommand}
                data-suggested={c.command === suggestion || undefined}
                onClick={() => pickCommand(c.command)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs hover:bg-accent ${
                  c.command === pickedCommand
                    ? "border-[#C15F3C] bg-[#C15F3C]/25 text-body"
                    : c.command === suggestion
                      ? "border-[#C15F3C]/70 bg-[#C15F3C]/10 text-body"
                      : "border-border bg-secondary text-body"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {running ? (
          <form
            className="relative rounded-panel border border-border bg-card px-3 py-2 focus-within:border-muted-foreground/40"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {goiLenh.length > 0 && (
              <ul
                role="listbox"
                aria-label="Commands"
                className="absolute bottom-full left-0 mb-1 max-h-72 w-full overflow-y-auto rounded-card border border-border bg-popover p-1 shadow-md"
              >
                {goiLenh.map((l) => (
                  <li key={l.name} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => setInput(l.chen)}
                      className="flex w-full items-baseline gap-2 rounded-control px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="font-mono text-sm text-body">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{l.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                !session.worktree
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
                  send();
                }
              }}
            />
            <div className="mt-1.5 flex items-center gap-2">
              {/* Attach needs a worktree to put the file in; the actions
                  panel does not — a chat session still picks its model. */}
              {session.worktree && <PlusMenu disabled={sending} onUpload={handleUpload} />}
              <ActionsPanel
                commands={session.worktree ? [...commands, ...BUILTIN_COMMANDS] : []}
                mode={session.worktree ? mode : null}
                model={model}
                onInsertCommand={insertCommand}
                onCompact={() => sendDirect("/compact")}
                onStop={() => void stopSessionAction(session.id)}
                onPickMode={switchMode}
                onPickModel={switchModel}
              />
              {model !== "default" && (
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {MODEL_OPTIONS.find((m) => m.value === model)?.label}
                </span>
              )}
              {contextTokens !== null && (
                <ContextRing percentOf={contextTokens} stopIt={contextUsed} owner={contextOf} />
              )}
              {contextTokens !== null && contextTokens >= 90 && (
                <span className="text-xs text-destructive">
                  almost full — auto-compact soon, or send /compact
                </span>
              )}
              <span className="flex-1" />
              {session.worktree && (
                <ModeMenu mode={mode} disabled={changingMode} onPick={switchMode} />
              )}
              {busy && !hasNewText ? (
                // Running and nothing new typed → the button is Stop, like
                // VSCode. Typing flips it back to send (the message queues).
                <Button
                  type="button"
                  size="icon"
                  aria-label="Stop session"
                  onClick={() => void stopSessionAction(session.id)}
                  className="size-7 rounded-full bg-destructive text-white hover:bg-destructive/80"
                >
                  <SquareIcon className="size-3" fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={sending || !hasNewText}
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
            <p className="text-sm text-muted-foreground">Session ended ({ended}).</p>
            <Button
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() =>
                batDauGui(async () => {
                  const outcome = await continueAction(session.id);
                  if (outcome.ok) {
                    // Full reload: the SSE stream closed on bee_done — a
                    // fresh page reattaches it to the resumed session.
                    window.location.reload();
                  } else {
                    setErr(outcome.message);
                  }
                })
              }
            >
              {sending ? "Continuing…" : "Continue session"}
            </Button>
          </div>
        )}
        {err !== "" && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}
