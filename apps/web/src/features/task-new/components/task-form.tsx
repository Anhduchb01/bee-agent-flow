"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { taoTask } from "../api/create";
import { taskFormSchema, TRUONG } from "../schemas/task-form";

const AC_MAU = "- [ ] Given …, When …, Then …\n- [ ] Given …, When …, Then …";

export function TaskForm({ repos }: { repos: { slug: string; full: string }[] }) {
  const router = useRouter();
  const [dangGui, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function gui(formData: FormData) {
    const raw = Object.fromEntries(
      [...formData.entries()].map(([k, v]) => [k, String(v)]),
    ) as Record<string, string>;

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
      router.push(`/t/${ketQua.slug}/${ketQua.number}`);
    });
  }

  return (
    <form action={gui} noValidate className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug" className="eyebrow">Dự án</Label>
        <select
          id="slug"
          name="slug"
          defaultValue={repos[0]?.slug ?? ""}
          className="h-8 w-full rounded-control border border-border bg-card px-2.5 text-sm text-foreground"
        >
          {repos.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.slug} — {r.full}
            </option>
          ))}
        </select>
        <Loi message={errors.slug} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title" className="eyebrow">Tiêu đề</Label>
        <Input id="title" name="title" placeholder="Thêm bộ lọc trạng thái cho danh sách đơn" />
        <Loi message={errors.title} />
      </div>

      {TRUONG.map((t) => (
        <div key={t.name} className="flex flex-col gap-2">
          <Label htmlFor={t.name} className="eyebrow">{t.label}</Label>
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={dangGui}>
          {dangGui ? "Đang tạo…" : "Tạo task"}
        </Button>
        <p className="text-sm text-body">
          Issue tạo ra mang tên bạn và gắn <code>status:ready-for-spec</code>.
        </p>
      </div>
    </form>
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
