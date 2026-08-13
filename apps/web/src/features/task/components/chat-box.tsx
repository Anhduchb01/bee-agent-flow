"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { khoangThoiGian } from "@/lib/duration";

import { guiComment } from "../api/actions";

/** Chu kỳ tick của reconciler. Trần trên của "bao lâu nữa agent nhìn thấy". */
const TICK_S = 30;
/** Quá mốc này mà agent chưa nhận thì im lặng là nói dối — phải nói ra. */
const HET_KIEN_NHAN_S = 5 * 60;

/**
 * Ô chat. Nó chỉ viết một comment lên GitHub — không gọi model, không chạy agent.
 *
 * Hệ quả phải nói thật với người dùng: vòng lặp này tính bằng **phút**, không
 * phải giây. Tối đa 30 giây tới tick sau, cộng thời gian agent chạy. Nói dối về
 * độ trễ tệ hơn chính độ trễ, nên ở đây không có spinner vô tận — có một đồng
 * hồ đếm thật, và khi quá 5 phút mà chưa ai nhận thì nó nói ra điều đó.
 */
export function ChatBox({
  slug,
  num,
  dangChayRule,
  dangChayGiay,
}: {
  slug: string;
  num: number;
  dangChayRule: string | null;
  dangChayGiay: number;
}) {
  const router = useRouter();
  const [dangGui, startTransition] = useTransition();
  const [guiLuc, setGuiLuc] = useState<number | null>(null);
  const [troi, setTroi] = useState(0);
  const [loi, setLoi] = useState<string | null>(null);

  // Đồng hồ chạy trong lúc chờ, và một lần làm mới mỗi tick để bắt được thời
  // điểm agent nhận việc. Cả hai dừng lại khi agent đã nhận.
  useEffect(() => {
    if (guiLuc === null || dangChayRule) return;

    const dem = setInterval(() => setTroi(Math.round((Date.now() - guiLuc) / 1000)), 1000);
    const lamMoi = setInterval(() => router.refresh(), TICK_S * 1000);
    return () => {
      clearInterval(dem);
      clearInterval(lamMoi);
    };
  }, [guiLuc, dangChayRule, router]);

  function gui(formData: FormData) {
    const noiDung = String(formData.get("noi-dung") ?? "");
    setLoi(null);
    startTransition(async () => {
      const ketQua = await guiComment(slug, num, noiDung);
      if (!ketQua.ok) {
        setLoi(ketQua.message);
        return;
      }
      setGuiLuc(Date.now());
      setTroi(0);
      router.refresh();
    });
  }

  return (
    <form action={gui} className="flex flex-col gap-3">
      <Label htmlFor="noi-dung" className="eyebrow">Nói tiếp với agent</Label>
      <Textarea
        id="noi-dung"
        name="noi-dung"
        rows={3}
        required
        placeholder="Trả lời câu hỏi của agent, hoặc yêu cầu sửa gì đó. @claude được thêm tự động."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={dangGui}>
          {dangGui ? "Đang gửi…" : "Gửi"}
        </Button>
        <TrangThai
          guiLuc={guiLuc}
          troi={troi}
          dangChayRule={dangChayRule}
          dangChayGiay={dangChayGiay}
        />
      </div>

      {loi ? <p className="text-sm text-destructive">{loi}</p> : null}
    </form>
  );
}

function TrangThai({
  guiLuc,
  troi,
  dangChayRule,
  dangChayGiay,
}: {
  guiLuc: number | null;
  troi: number;
  dangChayRule: string | null;
  dangChayGiay: number;
}) {
  if (dangChayRule) {
    return (
      <p aria-live="polite" className="text-sm text-body">
        agent đang làm · {khoangThoiGian(dangChayGiay)}
      </p>
    );
  }

  if (guiLuc === null) {
    return (
      <p className="text-sm text-body">
        Agent nhìn thấy ở tick sau — tối đa {TICK_S} giây.
      </p>
    );
  }

  if (troi > HET_KIEN_NHAN_S) {
    return (
      <p aria-live="polite" className="text-sm text-warning-deep">
        đã gửi {khoangThoiGian(troi)} trước, agent vẫn chưa nhận · có thể hàng đợi đang đầy hoặc
        dự án đang tạm dừng
      </p>
    );
  }

  return (
    <p aria-live="polite" className="text-sm text-body">
      đã gửi · chờ tick tiếp theo · {khoangThoiGian(troi)}
    </p>
  );
}
