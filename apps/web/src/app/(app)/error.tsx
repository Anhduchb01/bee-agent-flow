"use client";

import { Button } from "@/components/ui/button";

/**
 * Lưới an toàn cuối cùng. `lib/bee/` đã biến "file thiếu", "JSON hỏng" và
 * "heartbeat cũ" thành dữ liệu hiển thị được, nên tới được đây nghĩa là có gì
 * đó thực sự ngoài dự tính — và câu trả lời đúng vẫn là nói ra, không phải một
 * trang trắng.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-24">
      <h1 className="text-[2rem] leading-10 font-semibold tracking-heading text-foreground">
        This page broke
      </h1>
      <p className="text-sm text-body">
        {error.message || "No further details."}
        {error.digest ? <span className="ml-1 font-mono text-xs">({error.digest})</span> : null}
      </p>
      <div>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </main>
  );
}
