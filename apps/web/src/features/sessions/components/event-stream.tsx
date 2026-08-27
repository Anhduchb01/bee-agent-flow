"use client";

import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { pairToolCards, type Card } from "../lib/pair-tool-cards";
import type { StreamEvent } from "../lib/parse-events";

/**
 * Dòng sự kiện theo ngôn ngữ hình ảnh của Claude Code trong VSCode (dark là
 * mặc định của app): mỗi tool là một mục "● Tên  tóm-tắt-mờ" mở ra panel —
 * Bash thành khối IN/OUT, Edit/Write thành khối diff đỏ/xanh, lỗi tự mở.
 * Ghép cặp nằm ở pair-tool-cards.ts; đây chỉ là trình bày.
 */

/**
 * Lời agent render MARKDOWN như VSCode (đổi 19/08). react-markdown dựng
 * React elements và mặc định BỎ HTML thô trong nội dung — giữ nguyên bài
 * chống HTML injection của bản plain text.
 */
function AgentProse({ text }: { text: string }) {
  return (
    <div
      className="space-y-2 text-[0.9375rem] leading-6 text-body
        [&_a]:underline [&_a]:underline-offset-2
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]
        [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-[0.9375rem] [&_h3]:font-semibold
        [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5
        [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-3
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}
/**
 * VSCode-style shimmer for the seconds when the agent owes an answer but
 * nothing streams yet ("Pontificating…"). Without it the first message of
 * a session looks dead for 3-5s while the model reads the repo context.
 */
const NHIP_TU = [
  "Thinking",
  "Reading the repo",
  "Pondering",
  "Assembling context",
  "Reasoning",
  "Cooking",
  "Percolating",
];

function RunningPulse() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % NHIP_TU.length), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <p
      aria-label="Agent is working"
      className="flex animate-pulse items-center gap-2 text-sm text-muted-foreground"
    >
      <span aria-hidden className="text-[#C15F3C]">
        ✳
      </span>
      {NHIP_TU[i]}…
    </p>
  );
}

export function EventStream({
  events,
  typing,
  idle = "",
  waiting = false,
  onAnswerPermission,
}: {
  events: StreamEvent[];
  typing: string;
  idle?: string;
  /** Busy but nothing streaming yet — show the shimmer line. */
  waiting?: boolean;
  /** Manual mode (V2.5b): answer an approval card. Absent = read-only view. */
  onAnswerPermission?: (requestId: string, allow: boolean, inputJson: string) => void;
}) {
  const row = useMemo(() => pairToolCards(events), [events]);

  return (
    <div role="log" aria-label="Session events" className="flex flex-col gap-4">
      {row.map((m, i) => (
        <OneCard key={i} m={m} onAnswerPermission={onAnswerPermission} />
      ))}
      {idle !== "" && (
        <p
          aria-label="Agent is thinking"
          className="whitespace-pre-wrap text-sm text-muted-foreground italic"
        >
          {idle}
        </p>
      )}
      {typing !== "" && (
        <div aria-label="Agent is typing">
          <AgentProse text={typing} />
          <span className="animate-pulse">▍</span>
        </div>
      )}
      {waiting && <RunningPulse />}
    </div>
  );
}

/** Bash's `command` reads better than raw JSON; other tools show the JSON. */
function summariseArgs(name: string, args: string): string {
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    if (name === "Bash" && typeof o.command === "string") return o.command;
    if (typeof o.file_path === "string") return o.file_path;
  } catch {
    // fall through to raw
  }
  return args;
}

/**
 * Manual-mode approval card (V2.5b): the agent stops until the owner
 * answers. Deny sends a reason the model can read and adapt to.
 */
function PermissionCard({
  m,
  onAnswer,
}: {
  m: Extract<Card, { kind: "permission-asked" }>;
  onAnswer?: (requestId: string, allow: boolean, inputJson: string) => void;
}) {
  return (
    <div className="rounded-card border border-amber-500/50 bg-amber-500/5 px-3.5 py-3">
      <p className="mb-1.5 flex items-center gap-2 text-sm">
        <span className="text-amber-500">⏸</span>
        <span className="font-semibold text-body">Permission — {m.name}</span>
        {m.answer !== null && (
          <span
            className={`ml-auto font-mono text-xs ${
              m.answer === "allow" ? "text-green-500" : "text-red-400"
            }`}
          >
            {m.answer === "allow" ? "✓ allowed" : "✗ denied"}
          </span>
        )}
      </p>
      <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-2 font-mono text-xs">
        {summariseArgs(m.name, m.args)}
      </pre>
      {m.answer === null && onAnswer !== undefined && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onAnswer(m.requestId, true, m.args)}
            className="rounded-control bg-[#C15F3C] px-3 py-1 text-xs font-medium text-white hover:bg-[#a94f31]"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => onAnswer(m.requestId, false, m.args)}
            className="rounded-control border border-border px-3 py-1 text-xs text-body hover:bg-accent"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

function OneCard({
  m,
  onAnswerPermission,
}: {
  m: Card;
  onAnswerPermission?: (requestId: string, allow: boolean, inputJson: string) => void;
}) {
  switch (m.kind) {
    case "permission-asked":
      return <PermissionCard m={m} onAnswer={onAnswerPermission} />;
    case "lifecycle":
      return <p className="font-mono text-xs text-muted-foreground">· {m.text}</p>;
    case "user-said":
      // Như VSCode: hộp viền full-width, không phải bubble lệch phải.
      return (
        <div className="rounded-card border border-border bg-input/30 px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-6 text-body">{m.text}</p>
        </div>
      );
    case "agent-said":
      return <AgentProse text={m.text} />;
    case "thinking":
      return (
        <details className="group">
          <summary className="cursor-pointer list-none font-mono text-xs text-muted-foreground">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Thinking
          </summary>
          <p className="mt-1 whitespace-pre-wrap pl-4 text-sm text-muted-foreground italic">
            {m.text}
          </p>
        </details>
      );
    case "tool-card":
      return <TheTool m={m} />;
    case "artifact":
      return (
        <p className="flex items-baseline gap-2 text-sm">
          <span className="text-[var(--ok,#6FBF8E)]">●</span>
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-body underline-offset-2 hover:underline"
          >
            {m.artifactKind === "pr" ? "Pull request" : "Issue"}
            {m.number !== null ? ` #${m.number}` : ""}
          </a>
          {m.title !== null && (
            <span className="min-w-0 truncate text-muted-foreground">{m.title}</span>
          )}
          <span className="shrink-0 text-muted-foreground">↗</span>
        </p>
      );
    case "result":
      return (
        <p className="border-t border-border pt-2 font-mono text-xs text-muted-foreground">
          {m.err ? "turn ended with an error" : "turn finished"}
          {m.turns !== null ? ` · ${m.turns} turns` : ""}
        </p>
      );
    case "truncated":
      // Dữ liệu đã mất thật, không phải "xem sau sẽ có" — nói thẳng.
      return (
        <p className="rounded-control border border-dashed border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          ✂ {m.skipped} dòng đầu phiên đã bị cắt để giữ trần đĩa — phần đó không còn nữa.
        </p>
      );
    case "compact":
      // The seam matters: right after it the context ring drops sharply —
      // without this line that drop reads as a bug, not a rescue.
      return (
        <p className="border-t border-dashed border-border pt-2 font-mono text-xs text-muted-foreground">
          ⇅ Conversation compacted ({m.trigger === "manual" ? "/compact" : "auto"})
          {m.preTokens !== null ? ` · was ${Math.round(m.preTokens / 1000)}k tokens` : ""}
        </p>
      );
  }
}

/* ── Thẻ tool: ● Tên  tóm-tắt — mở ra panel theo từng loại tool ──────────── */

function TheTool({ m }: { m: Extract<Card, { kind: "tool-card" }> }) {
  const tomTat = m.file ?? m.command ?? (m.args === "{}" ? "" : m.args);
  const lineCount = countLines(m);

  return (
    <details className="group" open={m.status === "error"}>
      <summary className="flex cursor-pointer list-none items-baseline gap-2">
        <StatusPip status={m.status} />
        <span className="text-sm font-semibold text-body">{m.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {tomTat}
        </span>
        {lineCount !== null && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{lineCount}</span>
        )}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5 pl-4">
        <ThanThe m={m} />
      </div>
    </details>
  );
}

function ThanThe({ m }: { m: Extract<Card, { kind: "tool-card" }> }) {
  // Edit/Write → diff đỏ/xanh; Bash → IN/OUT; còn lại → args + kết quả.
  if (m.cu !== undefined || m.latest !== undefined) {
    return (
      <div className="overflow-hidden rounded-control border border-border font-mono text-xs leading-5">
        {m.cu !== undefined && <DiffBlock head="-" text={m.cu} />}
        {m.latest !== undefined && <DiffBlock head="+" text={m.latest} />}
      </div>
    );
  }

  if (m.command !== undefined) {
    return (
      <div className="overflow-hidden rounded-control border border-border font-mono text-xs leading-5">
        <GutterLine label="IN" text={m.command} />
        {m.result !== null && <GutterLine label="OUT" text={m.result} />}
      </div>
    );
  }

  return (
    <>
      {m.args !== "" && m.args !== "{}" && (
        <pre className="overflow-x-auto rounded-control border border-border p-2 font-mono text-xs text-muted-foreground">
          {m.args}
        </pre>
      )}
      {m.result !== null && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-control border border-border p-2 font-mono text-xs">
          {m.result}
        </pre>
      )}
    </>
  );
}

/** Khối diff một phía: từng dòng mang dấu +/− và nền màu như VSCode dark. */
function DiffBlock({ head, text }: { head: "+" | "-"; text: string }) {
  const mau =
    head === "+"
      ? "bg-green-950/50 text-green-200"
      : "bg-red-950/50 text-red-300";
  return (
    <div className={mau}>
      {text.split("\n").map((line, i) => (
        <div key={i} className="flex">
          <span className="w-6 shrink-0 select-none pl-1.5 opacity-60">{head}</span>
          <span className="whitespace-pre-wrap break-all pr-2">{line}</span>
        </div>
      ))}
    </div>
  );
}

function GutterLine({ label, text }: { label: "IN" | "OUT"; text: string }) {
  return (
    <div className="flex bg-input/30">
      <span className="w-9 shrink-0 select-none pt-1.5 pl-1.5 text-[0.625rem] tracking-wide text-muted-foreground">
        {label}
      </span>
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap py-1.5 pr-2">{text}</pre>
    </div>
  );
}

function countLines(m: Extract<Card, { kind: "tool-card" }>): string | null {
  if (m.cu === undefined && m.latest === undefined) return null;
  const added = m.latest === undefined ? 0 : m.latest.split("\n").length;
  const removeIt = m.cu === undefined ? 0 : m.cu.split("\n").length;
  const part: string[] = [];
  if (added > 0) part.push(`+${added}`);
  if (removeIt > 0) part.push(`−${removeIt}`);
  return part.join(" ");
}

function StatusPip({ status }: { status: "running" | "done" | "error" }) {
  if (status === "running") {
    return (
      <span className="animate-pulse text-amber-500" aria-label="running">
        ●
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-destructive" aria-label="failed">
        ●
      </span>
    );
  }
  return (
    <span className="text-[var(--ok,#6FBF8E)]" aria-label="done">
      ●
    </span>
  );
}
