import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClaudeSnapshot } from "@/lib/claude";

// The refresh button pulls in a server action whose import chain reaches
// next-auth, which vitest cannot resolve (`next/server`). Mock the module
// boundary — the panel under test only needs the button to render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../api/actions", () => ({
  refreshUsageAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

import { ClaudePanel } from "./claude-panel";

const NOW = Date.UTC(2026, 7, 13, 10, 0, 0);

function snapshot(percentOf: [number | null, number | null]): ClaudeSnapshot {
  return {
    quota: [
      {
        usageWindow: "five_hour",
        status: "allowed",
        percentOf: percentOf[0],
        resetsAt: Math.floor(NOW / 1000) + 3600,
      },
      {
        usageWindow: "weekly",
        status: "warning",
        percentOf: percentOf[1],
        resetsAt: Math.floor(NOW / 1000) + 86_400,
      },
    ],
    toolUse: {
      runCount: 13,
      errorCount: 6,
      token: 1_240_000,
      tiLeCache: 0.89,
      costToday: 2.41,
      costSevenDays: 14.8,
      stoppedOnQuota: 3,
    },
    dichVu: { indicator: "none", hint: "All Systems Operational", kiemLuc: "" },
  };
}

describe("ClaudePanel", () => {
  it("mỗi hạn mức đúng MỘT thanh", () => {
    /*
     * `Progress` của shadcn tự nối thêm một `ProgressTrack` sau `children`, nên
     * truyền track của mình vào sẽ ra hai thanh chồng lên nhau: thanh của mình
     * đúng màu, thanh mặc định màu `bg-primary` (đen) nằm ngay dưới. Trông y
     * như một thanh tiến trình thứ hai không ai giải thích được.
     *
     * Đếm cả track lẫn indicator: chỉ đếm indicator thì một track thừa nhưng
     * rỗng vẫn lọt.
     */
    const { container } = render(<ClaudePanel snapshot={snapshot([38, 81])} now={NOW} />);

    expect(container.querySelectorAll('[data-slot="progress-track"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="progress-indicator"]')).toHaveLength(2);
  });

  it("thanh đổi màu theo mức, không theo ý thích", () => {
    render(<ClaudePanel snapshot={snapshot([38, 97])} now={NOW} />);

    expect(screen.getByLabelText("5-hour limit")).toHaveClass(
      "[&_[data-slot=progress-indicator]]:bg-link",
    );
    // 97% vượt ngưỡng 95 nên đỏ, dù `status` mới chỉ là "warning": con số
    // thật đáng tin hơn nhãn mà nguồn tự dán cho mình.
    expect(screen.getByLabelText("Weekly limit")).toHaveClass(
      "[&_[data-slot=progress-indicator]]:bg-destructive",
    );
  });

  it("không có phần trăm thì hiện gạch ngang chứ không hiện 0%", () => {
    /*
     * Chưa có nguồn nào đã kiểm chứng phát ra phần trăm (xem `lib/claude/types.ts`),
     * nên `null` là trạng thái sẽ gặp thật khi nối vào dữ liệu thật. Vẽ "0%" ở
     * đó là nói dối theo hướng nguy hiểm nhất: "còn nguyên hạn mức".
     */
    render(<ClaudePanel snapshot={snapshot([null, 81])} now={NOW} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});
