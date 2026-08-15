"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { taoTask } from "../api/create";
import { bocKhoiTask, timKhoiTask, type KhoiTask } from "../lib/parse-task-block";

/**
 * Tạo task bằng một cuộc phỏng vấn, không phải bằng một cái form.
 *
 * Form cũ ép đủ năm mục ngay từ đầu, và đó là đúng cho một task đã nghĩ xong.
 * Nhưng phần lớn task bắt đầu bằng một câu — "cái danh sách đơn khó lọc quá" —
 * và bắt người ta dịch câu đó thành năm mục có thể kiểm chứng được, một mình,
 * trước khi được phép bấm nút, là chỗ mà mọi thứ dừng lại.
 *
 * Nên: người dùng nói câu đó, agent hỏi lại từng câu một, và khi nó đủ tự tin
 * thì nó in ra hợp đồng đầy đủ. Người dùng đọc, xin sửa nếu cần, rồi bấm tạo —
 * dưới tên mình.
 *
 * **Không có ô nào để điền.** Muốn đổi gì thì nói với agent; nó in lại cả bản
 * mới. Một ô sửa tay bên cạnh một cuộc hội thoại là hai nguồn sự thật, và bản
 * cuối cùng sẽ là bản không ai nhớ mình đã sửa.
 */

interface Loi {
  vai: "toi" | "agent";
  text: string;
}

const MO_DAU =
  "Kể cho tôi ý tưởng của bạn — một câu cũng được. Tôi sẽ hỏi lại vài câu rồi soạn hợp đồng task hoàn chỉnh.";

export function CreateTaskDialog({ slug }: { slug: string }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [loi, setLoi] = useState<Loi[]>([]);
  const [nhap, setNhap] = useState("");
  const [dangHoi, setDangHoi] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hong, setHong] = useState<string | null>(null);
  const [dangTao, startTransition] = useTransition();
  const cuoiRef = useRef<HTMLDivElement>(null);

  // Cuộn xuống khi có chữ mới. Không có nó thì câu trả lời dài đẩy phần đang
  // gõ ra khỏi màn hình và người dùng tưởng nó đứng.
  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ block: "end" });
  }, [loi, dangHoi]);

  /** Khối task mới nhất trong cả hội thoại — xem `timKhoiTask`. */
  const toanBo = loi
    .filter((l) => l.vai === "agent")
    .map((l) => l.text)
    .join("\n\n");
  const khoiRaw = timKhoiTask(toanBo);
  const boc = khoiRaw ? bocKhoiTask(khoiRaw) : null;

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
        body: JSON.stringify({ message, session_id: sessionId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("không đọc được luồng trả lời");
      const decoder = new TextDecoder();
      let dem = "";

      // NDJSON: mỗi dòng một sự kiện. Gom theo dòng chứ không parse từng chunk —
      // một chunk mạng cắt ngang giữa một dòng JSON là chuyện bình thường.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        dem += decoder.decode(value, { stream: true });
        let i;
        while ((i = dem.indexOf("\n")) >= 0) {
          const dong = dem.slice(0, i).trim();
          dem = dem.slice(i + 1);
          if (!dong) continue;
          let ev: { type?: string; text?: string; session_id?: string; error?: string };
          try {
            ev = JSON.parse(dong) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "text" && ev.text) {
            setLoi((l) => {
              const next = [...l];
              next[next.length - 1] = {
                vai: "agent",
                text: next[next.length - 1].text + ev.text,
              };
              return next;
            });
          } else if (ev.type === "done") {
            if (ev.session_id) setSessionId(ev.session_id);
            if (ev.error) setHong(ev.error);
          }
        }
      }
    } catch (e) {
      setHong(e instanceof Error ? e.message : String(e));
    } finally {
      setDangHoi(false);
    }
  }

  function tao(task: KhoiTask) {
    setHong(null);
    startTransition(async () => {
      const ketQua = await taoTask({ ...task, slug });
      if (!ketQua.ok) {
        setHong(Object.values(ketQua.errors).join(" · "));
        return;
      }
      setMo(false);
      router.push(`/t/${ketQua.slug}/${ketQua.number}`);
    });
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger render={<Button>New task</Button>} />
      <DialogContent className="flex h-[85vh] flex-col gap-0 sm:max-w-2xl">
        <DialogHeader className="pb-4">
          <DialogTitle>New task in {slug}</DialogTitle>
          <DialogDescription>
            Describe the idea in your own words. The agent asks a few questions, then drafts the
            full contract — you create it under your name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {loi.length === 0 ? (
            <p className="text-sm text-muted-foreground">{MO_DAU}</p>
          ) : (
            loi.map((l, i) => <BongChat key={i} loi={l} dangGo={dangHoi && i === loi.length - 1} />)
          )}

          {boc?.ok ? (
            <TheHopDong task={boc.task} dangTao={dangTao} onTao={() => tao(boc.task)} />
          ) : null}
          {boc && !boc.ok ? (
            <Alert variant="destructive">
              <AlertDescription>
                The draft is missing: {boc.thieu.join(", ")}. Ask the agent to fill those in.
              </AlertDescription>
            </Alert>
          ) : null}

          {hong ? (
            <Alert variant="destructive">
              <AlertDescription>{hong}</AlertDescription>
            </Alert>
          ) : null}
          <div ref={cuoiRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-border pt-4"
          action={() => gui(nhap)}
        >
          <Textarea
            value={nhap}
            onChange={(e) => setNhap(e.target.value)}
            // Enter gửi, Shift+Enter xuống dòng — thói quen của mọi ô chat.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void gui(nhap);
              }
            }}
            rows={2}
            placeholder={loi.length === 0 ? "Danh sách đơn khó lọc quá…" : "Trả lời…"}
            disabled={dangHoi}
            className="min-h-0 flex-1 resize-none"
          />
          <Button type="submit" disabled={dangHoi || !nhap.trim()}>
            {dangHoi ? "…" : "Send"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Khối ```task bị cắt khỏi bong bóng chat.
 *
 * Nó được hiện lại bên dưới dưới dạng thẻ hợp đồng, nên để nguyên trong dòng
 * hội thoại là hiện cùng một thứ hai lần — và bản markdown thô thì dài gấp ba.
 */
function BongChat({ loi, dangGo }: { loi: Loi; dangGo: boolean }) {
  const text = loi.text.replace(/```task\s*\n[\s\S]*?```/g, "").trim();
  if (!text && !dangGo) return null;

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-card px-4 py-3 text-sm whitespace-pre-wrap",
        loi.vai === "toi"
          ? "self-end bg-primary text-primary-foreground"
          : "self-start border border-border bg-card",
      )}
    >
      {text || (dangGo ? "…" : "")}
    </div>
  );
}

function TheHopDong({
  task,
  dangTao,
  onTao,
}: {
  task: KhoiTask;
  dangTao: boolean;
  onTao: () => void;
}) {
  const MUC: [string, string][] = [
    ["Goal", task.goal],
    ["Acceptance Criteria", task.acceptance],
    ["Technical constraints", task.constraints],
    ["Out of scope", task.out_of_scope],
    ["UI Reference", task.ui_reference],
  ];

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Draft contract</p>
        <p className="font-medium text-foreground">{task.title}</p>
      </div>
      <div className="flex flex-col gap-3">
        {MUC.map(([nhan, noi]) => (
          <div key={nhan} className="flex flex-col gap-1">
            <p className="eyebrow">{nhan}</p>
            <p className="text-sm whitespace-pre-wrap text-body">{noi}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onTao} disabled={dangTao}>
          {dangTao ? "Creating…" : "Create task"}
        </Button>
        {/* Không có nút sửa: muốn đổi gì thì nói với agent, nó in lại cả bản
            mới. Một ô sửa tay bên cạnh một cuộc hội thoại là hai nguồn sự thật. */}
        <p className="text-xs text-muted-foreground">
          Want changes? Ask in the chat — the draft updates.
        </p>
      </div>
    </div>
  );
}
