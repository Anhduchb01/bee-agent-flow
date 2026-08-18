import type { SuKien } from "../lib/parse-events";

/**
 * Dòng sự kiện của một phiên. Trình bày thuần — nhận sự kiện đã parse, không
 * biết gì về SSE. Đầu ra agent render PLAIN TEXT (PRD §4.1): nội dung
 * untrusted, muốn markdown đẹp thì V2 kèm sanitizer có test.
 */
export function EventStream({ suKien, dangGo }: { suKien: SuKien[]; dangGo: string }) {
  return (
    <div role="log" aria-label="Session events" className="flex flex-col gap-3">
      {suKien.map((sk, i) => (
        <MotSuKien key={i} sk={sk} />
      ))}
      {dangGo !== "" && (
        <p className="whitespace-pre-wrap text-body opacity-70" aria-label="Agent is typing">
          {dangGo}
          <span className="animate-pulse">▍</span>
        </p>
      )}
    </div>
  );
}

function MotSuKien({ sk }: { sk: SuKien }) {
  switch (sk.loai) {
    case "lifecycle":
      return <p className="font-mono text-xs text-muted-foreground">· {sk.text}</p>;
    case "nguoi-noi":
      return (
        <div className="self-end rounded-card border border-border bg-secondary px-3 py-2 max-w-[85%]">
          <p className="whitespace-pre-wrap text-body">{sk.text}</p>
        </div>
      );
    case "agent-noi":
      return <p className="whitespace-pre-wrap text-body">{sk.text}</p>;
    case "tool":
      return (
        <p className="font-mono text-xs text-muted-foreground">
          ⚙ <span className="text-body">{sk.ten}</span> {sk.thamSo}
        </p>
      );
    case "tool-xong":
      return (
        <details className="rounded-control border border-border px-3 py-1.5">
          <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
            tool result
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{sk.text}</pre>
        </details>
      );
    case "ket-qua":
      return (
        <p className="border-t border-border pt-2 font-mono text-xs text-muted-foreground">
          {sk.loi ? "turn ended with an error" : "turn finished"}
        </p>
      );
    case "artifact":
      // Khoảnh khắc sướng nhất của canvas bắt đầu từ đây: PR mọc ra ngay
      // trong dòng sự kiện. Link đã qua allowlist github.com ở parse-events.
      return (
        <p className="font-mono text-xs">
          ↗{" "}
          <a
            href={sk.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {sk.kind === "pr" ? "Pull request" : "Issue"}
            {sk.number !== null ? ` #${sk.number}` : ""}
          </a>{" "}
          <span className="text-muted-foreground">created</span>
        </p>
      );
    // delta gom ở hook, replay hiện thành dải báo ở LiveView — không render tại đây
    case "delta":
    case "replay":
      return null;
  }
}
