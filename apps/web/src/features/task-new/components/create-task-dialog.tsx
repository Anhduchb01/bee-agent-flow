"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { taoTask } from "../api/create";
import { taskFormSchema, TRUONG } from "../schemas/task-form";

const AC_MAU = "- [ ] Given …, When …, Then …\n- [ ] Given …, When …, Then …";

/**
 * Tạo task trong một modal, ngay tại dự án.
 *
 * Không còn màn hình riêng: dự án đã được chọn bởi việc bạn đang đứng ở đó, nên
 * một trang riêng chỉ thêm một lần điều hướng và một ô chọn lặp lại thứ người
 * dùng vừa nói.
 *
 * Form vẫn ép đủ **năm mục bắt buộc**. Đưa vào modal là để đỡ một cú nhảy
 * trang, không phải để nới hợp đồng — hợp đồng thiếu là gốc của mọi task build
 * lệch.
 */
export function CreateTaskDialog({ slug }: { slug: string }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dangGui, startTransition] = useTransition();

  function gui(formData: FormData) {
    const raw = {
      ...Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])),
      slug,
    } as Record<string, string>;

    // Kiểm trước khi gửi để người dùng không phải chờ một vòng mạng mới biết
    // mình thiếu mục nào. Server kiểm lại bằng đúng schema này.
    const parsed = taskFormSchema.safeParse(raw);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "slug");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    startTransition(async () => {
      const ketQua = await taoTask(raw);
      if (!ketQua.ok) {
        setErrors(ketQua.errors);
        return;
      }
      setMo(false);
      router.push(`/t/${ketQua.slug}/${ketQua.number}`);
    });
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger render={<Button>Tạo task</Button>} />
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <form action={gui} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Task mới trong {slug}</DialogTitle>
            <DialogDescription>
              Năm mục dưới đây đều bắt buộc. Điền đủ ngay từ đầu rẻ hơn một vòng hỏi ngược
              từ spec gatekeeper.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="title" className="eyebrow">
              Tiêu đề
            </Label>
            <Input
              id="title"
              name="title"
              placeholder="Thêm bộ lọc trạng thái cho danh sách đơn"
            />
            <Loi message={errors.title} />
          </div>

          {TRUONG.map((t) => (
            <div key={t.name} className="flex flex-col gap-2">
              <Label htmlFor={t.name} className="eyebrow">
                {t.label}
              </Label>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
              <Textarea
                id={t.name}
                name={t.name}
                rows={t.rows ?? 3}
                defaultValue={t.name === "acceptance" ? AC_MAU : undefined}
              />
              <Loi message={errors[t.name]} />
            </div>
          ))}

          <Loi message={errors.slug} />

          <DialogFooter className="sticky bottom-0 -mx-4 border-t border-border bg-popover px-4 py-3">
            <p className="mr-auto text-xs text-muted-foreground">
              Issue mang tên bạn, gắn <code>status:ready-for-spec</code>.
            </p>
            <Button type="button" variant="outline" onClick={() => setMo(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={dangGui}>
              {dangGui ? "Đang tạo…" : "Tạo task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Loi({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
