"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { ChatPanel } from "@/features/chat";

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

const MO_DAU =
  "Kể cho tôi ý tưởng của bạn — một câu cũng được. Tôi sẽ hỏi lại vài câu rồi soạn hợp đồng task hoàn chỉnh.";

export function CreateTaskDialog({ slug }: { slug: string }) {
  const [mo, setMo] = useState(false);

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
        <PhongVan slug={slug} onXong={() => setMo(false)} moDau={MO_DAU} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phần phỏng vấn, tách khỏi modal để màn dự án dùng lại nguyên khối ở cột phải.
 *
 * `duoi` chạy trên TOÀN BỘ lời agent đã nói, không phải lời cuối: người dùng xin
 * sửa thì model in ra một khối mới trọn vẹn, và `timKhoiTask` lấy khối CUỐI.
 */
export function PhongVan({
  slug,
  moDau,
  onXong,
}: {
  slug: string;
  moDau: string;
  onXong?: () => void;
}) {
  const router = useRouter();
  const [hong, setHong] = useState<string | null>(null);
  const [dangTao, startTransition] = useTransition();

  function tao(task: KhoiTask) {
    setHong(null);
    startTransition(async () => {
      const ketQua = await taoTask({ ...task, slug });
      if (!ketQua.ok) {
        setHong(Object.values(ketQua.errors).join(" · "));
        return;
      }
      onXong?.();
      router.push(`/t/${ketQua.slug}/${ketQua.number}`);
    });
  }

  return (
    <ChatPanel
      mode="spec"
      moDau={moDau}
      duoi={(toanBo) => {
        const khoi = timKhoiTask(toanBo);
        const boc = khoi ? bocKhoiTask(khoi) : null;
        return (
          <>
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
                <AlertDescription className="whitespace-pre-wrap">{hong}</AlertDescription>
              </Alert>
            ) : null}
          </>
        );
      }}
    />
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
