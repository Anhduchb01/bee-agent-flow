"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/features/chat";
import { bocKhoiTask, taoTask, timKhoiTask } from "@/features/task-new";
import type { PhienChat } from "@/lib/chat-store";

import { ghiNhoPhien } from "../api/chat";

/**
 * Cột phải của màn dự án: lịch sử phiên ở trên, hội thoại ở dưới.
 *
 * Một ô chat cho cả hai việc — hỏi về dự án và tạo task — vì với người dùng đó
 * là một mạch: "cái nào đang kẹt?" rồi "ừ thì thêm cho tôi cái này". Tách làm
 * hai ô là bắt họ tự biết trước mình sắp làm gì.
 *
 * Khác hẳn màn task, nơi hai chế độ CÓ tách: ở đó một bên đọc và một bên sinh
 * ra commit. Ở đây cả hai đều dừng lại trước một cái nút mà người phải bấm.
 */
export function ProjectChat({
  slug,
  boiCanh,
  lichSu,
}: {
  slug: string;
  boiCanh: string;
  lichSu: PhienChat[];
}) {
  const router = useRouter();
  const [phienMo, setPhienMo] = useState<PhienChat | null>(null);
  const [khoa, setKhoa] = useState(0);
  const [hong, setHong] = useState<string | null>(null);
  const [dangTao, startTransition] = useTransition();

  function moPhien(p: PhienChat | null) {
    setPhienMo(p);
    // Đổi khoá để React dựng lại ChatPanel từ đầu. Không có nó thì khung chat
    // giữ nguyên các lượt cũ trong khi phiên phía dưới đã là phiên khác — hai
    // thứ trên màn hình nói hai chuyện.
    setKhoa((k) => k + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Sessions</p>
          <Button variant="outline" size="sm" onClick={() => moPhien(null)}>
            New
          </Button>
        </div>
        {lichSu.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Conversations you start here show up in this list.
          </p>
        ) : (
          <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {lichSu.map((p) => (
              <li key={p.session_id}>
                <button
                  type="button"
                  onClick={() => moPhien(p)}
                  className={`w-full truncate rounded-input px-2 py-1 text-left text-xs hover:bg-muted ${
                    phienMo?.session_id === p.session_id ? "bg-muted text-foreground" : "text-body"
                  }`}
                  title={`${p.title} · ${p.login}`}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 border-t border-border pt-3">
        <ChatPanel
          key={khoa}
          mode="du-an"
          sessionId={phienMo?.session_id ?? null}
          // Phiên cũ đã mang ảnh chụp của LÚC ĐÓ. Gửi lại ảnh mới vào giữa một
          // hội thoại cũ là đưa hai trạng thái khác nhau cho cùng một câu hỏi.
          boiCanh={phienMo ? undefined : boiCanh}
          moDau={
            phienMo
              ? "Resumed. The project snapshot it has is from when this conversation started."
              : "Ask about this project, or describe something you want built and I will draft the task."
          }
          goiY={
            phienMo
              ? undefined
              : ["Cái nào đang chờ người?", "Task nào bị thử lại nhiều lần?", "Tuần này xong những gì?"]
          }
          luuPhien={(id, cauDau) => void ghiNhoPhien(slug, id, cauDau)}
          duoi={(toanBo) => {
            const khoi = timKhoiTask(toanBo);
            const boc = khoi ? bocKhoiTask(khoi) : null;
            if (!boc) return hongRa(hong);
            if (!boc.ok) {
              return (
                <Alert variant="destructive">
                  <AlertDescription>
                    The draft is missing: {boc.thieu.join(", ")}. Ask the agent to fill those in.
                  </AlertDescription>
                </Alert>
              );
            }
            return (
              <div className="flex flex-col gap-3 rounded-card border border-border bg-background p-4">
                <p className="eyebrow">Draft contract</p>
                <p className="text-sm font-medium text-foreground">{boc.task.title}</p>
                <Button
                  size="sm"
                  disabled={dangTao}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await taoTask({ ...boc.task, slug });
                      if (!r.ok) {
                        setHong(Object.values(r.errors).join(" · "));
                        return;
                      }
                      router.push(`/t/${r.slug}/${r.number}`);
                    })
                  }
                >
                  {dangTao ? "Creating…" : "Create task"}
                </Button>
                {hongRa(hong)}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

function hongRa(hong: string | null) {
  if (!hong) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="whitespace-pre-wrap">{hong}</AlertDescription>
    </Alert>
  );
}
