"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Ô chat, dùng chung cho cả hai chỗ: phỏng vấn tạo task ở màn dự án, và hỏi về
 * một lần chạy ở màn task.
 *
 * Phần chung là thứ đáng tách: gom NDJSON theo dòng, nối chữ vào bong bóng
 * cuối, cuộn theo, và phân biệt "đang gõ" với "đã xong". Viết hai lần là hai
 * lần sai khác nhau ở cùng một chỗ.
 *
 * Phần riêng đi vào `duoi`: màn dự án dựng thẻ hợp đồng, màn task dựng nút
 * "Request a change".
 */

export interface LoiChat {
  vai: "toi" | "agent";
  text: string;
}

export function ChatPanel({
  mode,
  taskId,
  sessionId,
  moDau,
  goiY,
  duoi,
  luuPhien,
}: {
  mode: "spec" | "hoi-run";
  taskId?: string;
  /** Phiên để nối lại. `hoi-run` không có nó thì agent không nhớ gì. */
  sessionId?: string | null;
  moDau: string;
  goiY?: string[];
  duoi?: (toanBoLoiAgent: string) => ReactNode;
  /** Gọi khi Claude cấp phiên mới — màn dự án dùng để lưu lịch sử. */
  luuPhien?: (id: string) => void;
}) {
  const [loi, setLoi] = useState<LoiChat[]>([]);
  const [nhap, setNhap] = useState("");
  const [dangHoi, setDangHoi] = useState(false);
  const [phien, setPhien] = useState<string | null>(sessionId ?? null);
  const [hong, setHong] = useState<string | null>(null);
  const cuoiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ block: "end" });
  }, [loi, dangHoi]);

  const toanBo = loi
    .filter((l) => l.vai === "agent")
    .map((l) => l.text)
    .join("\n\n");

  async function gui(text: string) {
    const message = text.trim();
    if (!message || dangHoi) return;

    setNhap("");
    setHong(null);
    setLoi((l) => [...l, { vai: "toi", text: message }, { vai: "agent", text: "" }]);
    setDangHoi(true);

    try {
      const res = await fetch("/api/spec-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, task_id: taskId, session_id: phien, message }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("không đọc được luồng trả lời");

      const decoder = new TextDecoder();
      let dem = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        dem += decoder.decode(value, { stream: true });
        // NDJSON: gom theo DÒNG. Một chunk mạng cắt ngang giữa một dòng JSON là
        // chuyện bình thường, và parse từng chunk là hỏng ngay ở câu trả lời dài.
        let i;
        while ((i = dem.indexOf("\n")) >= 0) {
          const dong = dem.slice(0, i).trim();
          dem = dem.slice(i + 1);
          if (!dong) continue;
          let ev: {
            type?: string;
            text?: string;
            session_id?: string;
            error?: string;
            replaces_last?: boolean;
          };
          try {
            ev = JSON.parse(dong) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "text" && ev.text) {
            setLoi((l) => {
              const next = [...l];
              next[next.length - 1] = { vai: "agent", text: next[next.length - 1].text + ev.text };
              return next;
            });
          } else if (ev.type === "done") {
            if (ev.session_id) {
              setPhien(ev.session_id);
              luuPhien?.(ev.session_id);
            }
            if (ev.error) setHong(ev.error);
            // Claude in câu lỗi ra như một câu trả lời bình thường trước khi
            // đóng lượt, nên nó đã nằm sẵn trong bong bóng cuối.
            if (ev.replaces_last) setLoi((l) => l.slice(0, -1));
          }
        }
      }
    } catch (e) {
      setHong(e instanceof Error ? e.message : String(e));
    } finally {
      setDangHoi(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {loi.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{moDau}</p>
            {goiY && goiY.length > 0 ? (
              <div className="flex flex-col items-start gap-2">
                {goiY.map((g) => (
                  <Button
                    key={g}
                    variant="outline"
                    size="sm"
                    className="h-auto text-left whitespace-normal"
                    onClick={() => void gui(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          loi.map((l, i) => (
            <Bong key={i} loi={l} dangGo={dangHoi && i === loi.length - 1} />
          ))
        )}

        {duoi?.(toanBo)}

        {hong ? (
          <Alert variant="destructive">
            <AlertDescription className="whitespace-pre-wrap">{hong}</AlertDescription>
          </Alert>
        ) : null}
        <div ref={cuoiRef} />
      </div>

      <form className="flex items-end gap-2 border-t border-border pt-3" action={() => gui(nhap)}>
        <Textarea
          value={nhap}
          onChange={(e) => setNhap(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void gui(nhap);
            }
          }}
          rows={2}
          placeholder="Ask…"
          disabled={dangHoi}
          className="min-h-0 flex-1 resize-none"
        />
        <Button type="submit" disabled={dangHoi || !nhap.trim()}>
          {dangHoi ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

/**
 * Khối ```task bị cắt khỏi bong bóng: màn dự án dựng lại nó thành thẻ hợp đồng
 * ngay bên dưới, nên để nguyên là hiện cùng một thứ hai lần — và bản markdown
 * thô thì dài gấp ba.
 */
function Bong({ loi, dangGo }: { loi: LoiChat; dangGo: boolean }) {
  const text = loi.text.replace(/```task\s*\n[\s\S]*?```/g, "").trim();
  if (!text && !dangGo) return null;
  return (
    <div
      className={cn(
        "max-w-[90%] rounded-card px-3.5 py-2.5 text-sm whitespace-pre-wrap",
        loi.vai === "toi"
          ? "self-end bg-primary text-primary-foreground"
          : "self-start border border-border bg-card",
      )}
    >
      {text || (dangGo ? "…" : "")}
    </div>
  );
}
