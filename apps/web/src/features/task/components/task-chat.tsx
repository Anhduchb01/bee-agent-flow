"use client";

import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatPanel } from "@/features/chat";
import { cn } from "@/lib/utils";

import { guiComment } from "../api/actions";

/**
 * Cột phải của trang task. Hai việc rất khác nhau, nên hai chế độ rõ ràng chứ
 * không phải một ô chat "thông minh" tự đoán.
 *
 * **Ask** nối lại đúng phiên của lần chạy gần nhất. Trả lời trong vài giây, và
 * agent KHÔNG có tool nào — nó nhớ, nó không nhìn lại. Dùng để hiểu vì sao nó
 * làm thế.
 *
 * **Request a change** đăng một comment `@claude` lên PR. Rule 02 nhặt ở tick
 * sau, nối lại đúng phiên đó trong một worktree thật, sửa code và đẩy commit.
 *
 * Vì sao không gộp làm một: hai đường có hậu quả khác hẳn nhau. Một bên là đọc,
 * một bên sinh ra commit. Để model tự đoán bạn muốn bên nào là để nó quyết định
 * thay bạn một việc mà bạn phải là người quyết.
 */
export function TaskChat({
  slug,
  num,
  taskId,
  sessionId,
  coPr,
}: {
  slug: string;
  num: number;
  /** `<slug>-<số>` của lần chạy gần nhất — cwd để `--resume` tìm ra phiên. */
  taskId: string | null;
  sessionId: string | null;
  coPr: boolean;
}) {
  const [che, setChe] = useState<"hoi" | "sua">("hoi");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex gap-1.5">
        <Nut chon={che === "hoi"} onClick={() => setChe("hoi")}>
          Ask
        </Nut>
        <Nut chon={che === "sua"} onClick={() => setChe("sua")}>
          Request a change
        </Nut>
      </div>

      {che === "hoi" ? (
        sessionId && taskId ? (
          <ChatPanel
            mode="hoi-run"
            taskId={taskId}
            sessionId={sessionId}
            moDau="Resumed into the agent's own session for this task. It remembers what it did — it cannot look at the code again."
            goiY={[
              "Vì sao bạn chọn cách này thay vì cách kia?",
              "Chỗ nào bạn không chắc?",
              "Phần nào dễ vỡ nếu tôi sửa tiếp?",
            ]}
          />
        ) : (
          <Alert>
            <AlertDescription>
              No agent session on this task yet. Once the agent runs, you can resume its session
              here and ask why it did what it did.
            </AlertDescription>
          </Alert>
        )
      ) : (
        <YeuCauSua slug={slug} num={num} coPr={coPr} />
      )}
    </div>
  );
}

function Nut({
  chon,
  onClick,
  children,
}: {
  chon: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={chon ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(!chon && "text-muted-foreground")}
    >
      {children}
    </Button>
  );
}

function YeuCauSua({ slug, num, coPr }: { slug: string; num: number; coPr: boolean }) {
  const [text, setText] = useState("");
  const [ket, setKet] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function gui() {
    const noi = text.trim();
    if (!noi) return;
    startTransition(async () => {
      const r = await guiComment(slug, num, noi);
      setKet(r.message);
      if (r.ok) setText("");
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-body">
        This posts your request on the task as <code>@claude …</code>. The orchestrator picks it up
        on the next tick, resumes the same session in a real worktree, and pushes a commit. You will
        see it in the conversation on the left.
      </p>
      {/* Rule 02 chỉ quét PULL REQUEST. Chưa có PR thì comment vẫn được đăng
          nhưng không ai nhặt — nói trước, đừng để người ta ngồi đợi một tick
          không bao giờ tới. */}
      {coPr ? null : (
        <Alert>
          <AlertDescription>
            There is no pull request yet, so nothing will pick this up. It will still be posted as a
            comment for a human to read.
          </AlertDescription>
        </Alert>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Cũng xử lý trường hợp danh sách rỗng…"
        className="flex-1"
      />
      <div className="flex items-center gap-3">
        <Button onClick={gui} disabled={dangGui || !text.trim()}>
          {dangGui ? "Sending…" : "Send request"}
        </Button>
        {ket ? <span className="text-sm text-muted-foreground">{ket}</span> : null}
      </div>
    </div>
  );
}
