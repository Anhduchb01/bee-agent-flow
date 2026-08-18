import { useMemo } from "react";

import { ghepThe, type Muc } from "../lib/ghep-the";
import type { SuKien } from "../lib/parse-events";

/**
 * Dòng sự kiện theo ngôn ngữ hình ảnh của Claude Code trong VSCode (dark là
 * mặc định của app): mỗi tool là một mục "● Tên  tóm-tắt-mờ" mở ra panel —
 * Bash thành khối IN/OUT, Edit/Write thành khối diff đỏ/xanh, lỗi tự mở.
 * Ghép cặp nằm ở ghep-the.ts; đây chỉ là trình bày.
 * Đầu ra agent vẫn là PLAIN TEXT (PRD §4.1) — chưa render markdown.
 */
export function EventStream({
  suKien,
  dangGo,
  dangNghi = "",
}: {
  suKien: SuKien[];
  dangGo: string;
  dangNghi?: string;
}) {
  const muc = useMemo(() => ghepThe(suKien), [suKien]);

  return (
    <div role="log" aria-label="Session events" className="flex flex-col gap-4">
      {muc.map((m, i) => (
        <MotMuc key={i} m={m} />
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
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-6 text-body" aria-label="Agent is typing">
          {dangGo}
          <span className="animate-pulse">▍</span>
        </p>
      )}
    </div>
  );
}

function MotMuc({ m }: { m: Muc }) {
  switch (m.loai) {
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
      return (
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-6 text-body">{m.text}</p>
      );
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
