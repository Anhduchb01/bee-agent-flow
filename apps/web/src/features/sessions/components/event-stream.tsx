"use client";

import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ghepThe, type Muc } from "../lib/ghep-the";
import type { SuKien } from "../lib/parse-events";

/**
 * Dòng sự kiện theo ngôn ngữ hình ảnh của Claude Code trong VSCode (dark là
 * mặc định của app): mỗi tool là một mục "● Tên  tóm-tắt-mờ" mở ra panel —
 * Bash thành khối IN/OUT, Edit/Write thành khối diff đỏ/xanh, lỗi tự mở.
 * Ghép cặp nằm ở ghep-the.ts; đây chỉ là trình bày.
 */

/**
 * Lời agent render MARKDOWN như VSCode (đổi 19/08). react-markdown dựng
 * React elements và mặc định BỎ HTML thô trong nội dung — giữ nguyên bài
 * chống HTML injection của bản plain text.
 */
function ChuAgent({ text }: { text: string }) {
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

function NhipChay() {
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
  suKien,
  dangGo,
  dangNghi = "",
  dangCho = false,
  onTraLoiQuyen,
}: {
  suKien: SuKien[];
  dangGo: string;
  dangNghi?: string;
  /** Busy but nothing streaming yet — show the shimmer line. */
  dangCho?: boolean;
  /** Manual mode (V2.5b): answer an approval card. Absent = read-only view. */
  onTraLoiQuyen?: (requestId: string, choPhep: boolean, inputJson: string) => void;
}) {
  const muc = useMemo(() => ghepThe(suKien), [suKien]);

  return (
    <div role="log" aria-label="Session events" className="flex flex-col gap-4">
      {muc.map((m, i) => (
        <MotMuc key={i} m={m} onTraLoiQuyen={onTraLoiQuyen} />
      ))}
      {dangNghi !== "" && (
        <p
          aria-label="Agent is thinking"
          className="whitespace-pre-wrap text-sm text-muted-foreground italic"
        >
          {dangNghi}
        </p>
      )}
      {dangGo !== "" && (
        <div aria-label="Agent is typing">
          <ChuAgent text={dangGo} />
          <span className="animate-pulse">▍</span>
        </div>
      )}
      {dangCho && <NhipChay />}
    </div>
  );
}

/** Bash's `command` reads better than raw JSON; other tools show the JSON. */
function tomTatThamSo(ten: string, thamSo: string): string {
  try {
    const o = JSON.parse(thamSo) as Record<string, unknown>;
    if (ten === "Bash" && typeof o.command === "string") return o.command;
    if (typeof o.file_path === "string") return o.file_path;
  } catch {
    // fall through to raw
  }
  return thamSo;
}

/**
 * Manual-mode approval card (V2.5b): the agent stops until the owner
 * answers. Deny sends a reason the model can read and adapt to.
 */
function TheXinQuyen({
  m,
  onTraLoi,
}: {
  m: Extract<Muc, { loai: "xin-quyen" }>;
  onTraLoi?: (requestId: string, choPhep: boolean, inputJson: string) => void;
}) {
  return (
    <div className="rounded-card border border-amber-500/50 bg-amber-500/5 px-3.5 py-3">
      <p className="mb-1.5 flex items-center gap-2 text-sm">
        <span className="text-amber-500">⏸</span>
        <span className="font-semibold text-body">Permission — {m.ten}</span>
        {m.traLoi !== null && (
          <span
            className={`ml-auto font-mono text-xs ${
              m.traLoi === "allow" ? "text-green-500" : "text-red-400"
            }`}
          >
            {m.traLoi === "allow" ? "✓ allowed" : "✗ denied"}
          </span>
        )}
      </p>
      <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-2 font-mono text-xs">
        {tomTatThamSo(m.ten, m.thamSo)}
      </pre>
      {m.traLoi === null && onTraLoi !== undefined && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onTraLoi(m.requestId, true, m.thamSo)}
            className="rounded-control bg-[#C15F3C] px-3 py-1 text-xs font-medium text-white hover:bg-[#a94f31]"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => onTraLoi(m.requestId, false, m.thamSo)}
            className="rounded-control border border-border px-3 py-1 text-xs text-body hover:bg-accent"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

function MotMuc({
  m,
  onTraLoiQuyen,
}: {
  m: Muc;
  onTraLoiQuyen?: (requestId: string, choPhep: boolean, inputJson: string) => void;
}) {
  switch (m.loai) {
    case "xin-quyen":
      return <TheXinQuyen m={m} onTraLoi={onTraLoiQuyen} />;
    case "lifecycle":
      return <p className="font-mono text-xs text-muted-foreground">· {m.text}</p>;
    case "nguoi-noi":
      // Như VSCode: hộp viền full-width, không phải bubble lệch phải.
      return (
        <div className="rounded-card border border-border bg-input/30 px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-6 text-body">{m.text}</p>
        </div>
      );
    case "agent-noi":
      return <ChuAgent text={m.text} />;
    case "nghi":
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
            {m.kind === "pr" ? "Pull request" : "Issue"}
            {m.number !== null ? ` #${m.number}` : ""}
          </a>
          {m.title !== null && (
            <span className="min-w-0 truncate text-muted-foreground">{m.title}</span>
          )}
          <span className="shrink-0 text-muted-foreground">↗</span>
        </p>
      );
    case "ket-qua":
      return (
        <p className="border-t border-border pt-2 font-mono text-xs text-muted-foreground">
          {m.loi ? "turn ended with an error" : "turn finished"}
          {m.luot !== null ? ` · ${m.luot} turns` : ""}
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

function TheTool({ m }: { m: Extract<Muc, { loai: "tool-card" }> }) {
  const tomTat = m.file ?? m.lenh ?? (m.thamSo === "{}" ? "" : m.thamSo);
  const soDong = demDong(m);

  return (
    <details className="group" open={m.trangThai === "loi"}>
      <summary className="flex cursor-pointer list-none items-baseline gap-2">
        <ChamTrangThai trangThai={m.trangThai} />
        <span className="text-sm font-semibold text-body">{m.ten}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {tomTat}
        </span>
        {soDong !== null && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{soDong}</span>
        )}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5 pl-4">
        <ThanThe m={m} />
      </div>
    </details>
  );
}

function ThanThe({ m }: { m: Extract<Muc, { loai: "tool-card" }> }) {
  // Edit/Write → diff đỏ/xanh; Bash → IN/OUT; còn lại → args + kết quả.
  if (m.cu !== undefined || m.moi !== undefined) {
    return (
      <div className="overflow-hidden rounded-control border border-border font-mono text-xs leading-5">
        {m.cu !== undefined && <KhoiDiff dau="-" text={m.cu} />}
        {m.moi !== undefined && <KhoiDiff dau="+" text={m.moi} />}
      </div>
    );
  }

  if (m.lenh !== undefined) {
    return (
      <div className="overflow-hidden rounded-control border border-border font-mono text-xs leading-5">
        <DongGutter nhan="IN" text={m.lenh} />
        {m.ketQua !== null && <DongGutter nhan="OUT" text={m.ketQua} />}
      </div>
    );
  }

  return (
    <>
      {m.thamSo !== "" && m.thamSo !== "{}" && (
        <pre className="overflow-x-auto rounded-control border border-border p-2 font-mono text-xs text-muted-foreground">
          {m.thamSo}
        </pre>
      )}
      {m.ketQua !== null && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-control border border-border p-2 font-mono text-xs">
          {m.ketQua}
        </pre>
      )}
    </>
  );
}

/** Khối diff một phía: từng dòng mang dấu +/− và nền màu như VSCode dark. */
function KhoiDiff({ dau, text }: { dau: "+" | "-"; text: string }) {
  const mau =
    dau === "+"
      ? "bg-green-950/50 text-green-200"
      : "bg-red-950/50 text-red-300";
  return (
    <div className={mau}>
      {text.split("\n").map((dong, i) => (
        <div key={i} className="flex">
          <span className="w-6 shrink-0 select-none pl-1.5 opacity-60">{dau}</span>
          <span className="whitespace-pre-wrap break-all pr-2">{dong}</span>
        </div>
      ))}
    </div>
  );
}

function DongGutter({ nhan, text }: { nhan: "IN" | "OUT"; text: string }) {
  return (
    <div className="flex bg-input/30">
      <span className="w-9 shrink-0 select-none pt-1.5 pl-1.5 text-[0.625rem] tracking-wide text-muted-foreground">
        {nhan}
      </span>
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap py-1.5 pr-2">{text}</pre>
    </div>
  );
}

function demDong(m: Extract<Muc, { loai: "tool-card" }>): string | null {
  if (m.cu === undefined && m.moi === undefined) return null;
  const them = m.moi === undefined ? 0 : m.moi.split("\n").length;
  const xoa = m.cu === undefined ? 0 : m.cu.split("\n").length;
  const phan: string[] = [];
  if (them > 0) phan.push(`+${them}`);
  if (xoa > 0) phan.push(`−${xoa}`);
  return phan.join(" ");
}

function ChamTrangThai({ trangThai }: { trangThai: "dang-chay" | "xong" | "loi" }) {
  if (trangThai === "dang-chay") {
    return (
      <span className="animate-pulse text-amber-500" aria-label="running">
        ●
      </span>
    );
  }
  if (trangThai === "loi") {
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
