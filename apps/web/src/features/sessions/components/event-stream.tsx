import { useMemo } from "react";

import { ghepThe, type Muc } from "../lib/ghep-the";
import type { SuKien } from "../lib/parse-events";

/**
 * Dòng sự kiện kiểu panel Claude Code trong VSCode: tool call là MỘT thẻ có
 * trạng thái (● đang chạy → ✓/✗, kết quả gập trong thẻ), thinking gập mặc
 * định, chữ agent streaming. Trình bày thuần — ghép cặp nằm ở ghep-the.ts.
 * Đầu ra agent vẫn là PLAIN TEXT (PRD §4.1).
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
    <div role="log" aria-label="Session events" className="flex flex-col gap-3">
      {muc.map((m, i) => (
        <MotMuc key={i} m={m} />
      ))}
      {dangNghi !== "" && (
        <p
          aria-label="Agent is thinking"
          className="whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground italic"
        >
          {dangNghi}
        </p>
      )}
      {dangGo !== "" && (
        <p className="whitespace-pre-wrap text-body" aria-label="Agent is typing">
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
      return (
        <div className="max-w-[85%] self-end rounded-card border border-border bg-secondary px-3 py-2">
          <p className="whitespace-pre-wrap text-body">{m.text}</p>
        </div>
      );
    case "agent-noi":
      return <p className="whitespace-pre-wrap text-body">{m.text}</p>;
    case "nghi":
      return (
        <details>
          <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
            Thinking
          </summary>
          <p className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground">
            {m.text}
          </p>
        </details>
      );
    case "tool-card":
      return <TheTool m={m} />;
    case "artifact":
      return (
        <p className="font-mono text-xs">
          ↗{" "}
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {m.kind === "pr" ? "Pull request" : "Issue"}
            {m.number !== null ? ` #${m.number}` : ""}
          </a>{" "}
          <span className="text-muted-foreground">created</span>
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

function TheTool({ m }: { m: Extract<Muc, { loai: "tool-card" }> }) {
  // Mỗi tool một dòng tóm tắt đúng thứ người cần liếc: Bash → lệnh,
  // Edit/Write/Read → file, còn lại → tham số cắt gọn.
  const tomTat = m.lenh ?? m.file ?? m.thamSo;

  return (
    // Thẻ lỗi tự mở — lỗi không được phép gập lại chờ người tò mò.
    <details
      className={`rounded-control border px-3 py-1.5 ${
        m.trangThai === "loi" ? "border-destructive" : "border-border"
      }`}
      open={m.trangThai === "loi"}
    >
      <summary className="flex cursor-pointer items-center gap-2 font-mono text-xs">
        <TrangThaiTool trangThai={m.trangThai} />
        <span className="font-semibold text-body">{m.ten}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{tomTat}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {m.lenh === undefined && m.file === undefined ? null : (
          <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">{m.thamSo}</pre>
        )}
        {m.ketQua !== null && (
          <pre className="overflow-x-auto whitespace-pre-wrap border-t border-border pt-2 font-mono text-xs">
            {m.ketQua}
          </pre>
        )}
      </div>
    </details>
  );
}

function TrangThaiTool({ trangThai }: { trangThai: "dang-chay" | "xong" | "loi" }) {
  if (trangThai === "dang-chay") {
    return (
      <span className="animate-pulse text-muted-foreground" aria-label="running">
        ●
      </span>
    );
  }
  if (trangThai === "loi") {
    return (
      <span className="text-destructive" aria-label="failed">
        ✗
      </span>
    );
  }
  return (
    <span className="text-[var(--ok,theme(colors.green.600))]" aria-label="done">
      ✓
    </span>
  );
}
