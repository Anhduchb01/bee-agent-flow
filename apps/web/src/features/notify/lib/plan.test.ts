import { describe, expect, it } from "vitest";

import type { InboxItem } from "@/features/inbox";

import { GAP_S, IM_LANG_SAU_THAO_TAC_S, lenKeHoach, type TrangThaiBao } from "./plan";

const NOW = new Date("2026-08-13T10:00:00Z");
const GOC = "https://bee.vidu.com";

function muc(over: Partial<InboxItem> = {}): InboxItem {
  return {
    key: "myapp#44",
    kind: "duyet-spec",
    slug: "myapp",
    number: 44,
    title: "Thêm filter cho danh sách đơn hàng",
    waitingSince: "2026-08-13T09:00:00Z",
    waitingS: 3600,
    priority: false,
    prNumber: null,
    prUrl: null,
    action: { kind: "duyet-spec", label: "Duyệt spec" },
    ...over,
  };
}

const truoc = (giay: number) => new Date(NOW.getTime() - giay * 1000).toISOString();

function chay(items: InboxItem[], state: Record<string, TrangThaiBao> = {}) {
  return lenKeHoach({
    nguoi: [{ login: "pm-linh", items }],
    state,
    goc: GOC,
    now: NOW,
  });
}

describe("một mục mới", () => {
  it("gửi một tin có link mở thẳng vào task", () => {
    const { tin } = chay([muc()]);

    expect(tin).toHaveLength(1);
    expect(tin[0].login).toBe("pm-linh");
    expect(tin[0].text).toBe(
      [
        "🐝 #44 duyệt spec · myapp",
        '   "Thêm filter cho danh sách đơn hàng"',
        `   → ${GOC}/t/myapp/44`,
      ].join("\n"),
    );
  });

  it("hộp thư đang yên thì tin đầu tiên đi ngay, không chờ hết cửa sổ gộp", () => {
    expect(chay([muc()]).tin).toHaveLength(1);
  });
});

describe("gộp, không spam", () => {
  it("nhiều mục cùng lúc gộp thành một tin", () => {
    const { tin } = chay([
      muc(),
      muc({ key: "shop#12", slug: "shop", number: 12, title: "Lịch sử giá", waitingS: 7200 }),
      muc({ key: "blog#9", slug: "blog", number: 9, title: "RSS 500", waitingS: 900 }),
    ]);

    expect(tin).toHaveLength(1);
    expect(tin[0].text).toContain("3 việc đang chờ bạn");
    expect(tin[0].keys).toEqual(["shop#12", "myapp#44", "blog#9"]);
  });

  it("thứ tự trong tin giống thứ tự trong hộp thư — chờ lâu nhất trước", () => {
    const { tin } = chay([
      muc({ key: "a#1", number: 1, waitingS: 100 }),
      muc({ key: "b#2", number: 2, waitingS: 9000 }),
    ]);

    expect(tin[0].text.indexOf("#2")).toBeLessThan(tin[0].text.indexOf("#1"));
  });

  it("vừa gửi tin xong thì mục mới gộp vào lượt sau", () => {
    const state = {
      "pm-linh": { daBao: {}, lanCuoi: truoc(GAP_S - 30), thaoTacCuoi: null },
    };

    const { tin, boQua } = chay([muc()], state);
    expect(tin).toHaveLength(0);
    expect(boQua["pm-linh"]).toContain("gộp vào lượt sau");
  });

  it("qua cửa sổ gộp thì gửi tiếp", () => {
    const state = {
      "pm-linh": { daBao: {}, lanCuoi: truoc(GAP_S + 1), thaoTacCuoi: null },
    };

    expect(chay([muc()], state).tin).toHaveLength(1);
  });
});

describe("không bắn lại", () => {
  it("mục đã báo thì không báo lần hai", () => {
    const state = {
      "pm-linh": { daBao: { "myapp#44": truoc(9000) }, lanCuoi: truoc(9000), thaoTacCuoi: null },
    };

    const { tin, boQua } = chay([muc()], state);
    expect(tin).toHaveLength(0);
    expect(boQua["pm-linh"]).toContain("không có mục nào mới");
  });

  it("chỉ mục chưa báo mới vào tin", () => {
    const state = {
      "pm-linh": { daBao: { "myapp#44": truoc(9000) }, lanCuoi: truoc(9000), thaoTacCuoi: null },
    };

    const { tin } = chay([muc(), muc({ key: "shop#12", slug: "shop", number: 12 })], state);
    expect(tin[0].keys).toEqual(["shop#12"]);
    expect(tin[0].text).not.toContain("#44");
  });

  it("mục đã xử lý xong rồi quay lại là một việc mới, được báo lại", () => {
    const state = {
      "pm-linh": {
        daBao: { "myapp#44": truoc(9000), "myapp#99": truoc(9000) },
        lanCuoi: truoc(9000),
        thaoTacCuoi: null,
      },
    };

    // #99 không còn trong hộp thư nữa → rơi khỏi state.
    const { stateMoi } = chay([muc(), muc({ key: "shop#12", slug: "shop", number: 12 })], state);
    expect(Object.keys(stateMoi["pm-linh"].daBao).sort()).toEqual(["myapp#44", "shop#12"]);
  });
});

describe("người đang ngồi trong app", () => {
  it("vừa thao tác dưới 2 phút thì không báo", () => {
    const state = {
      "pm-linh": {
        daBao: {},
        lanCuoi: null,
        thaoTacCuoi: truoc(IM_LANG_SAU_THAO_TAC_S - 10),
      },
    };

    const { tin, boQua } = chay([muc()], state);
    expect(tin).toHaveLength(0);
    expect(boQua["pm-linh"]).toContain("vừa thao tác");
  });

  it("không đánh dấu đã báo khi bỏ qua, nên lượt sau vẫn báo", () => {
    const state = {
      "pm-linh": { daBao: {}, lanCuoi: null, thaoTacCuoi: truoc(10) },
    };

    expect(chay([muc()], state).stateMoi["pm-linh"]).toBeUndefined();
  });

  it("thao tác đã lâu thì báo bình thường", () => {
    const state = {
      "pm-linh": {
        daBao: {},
        lanCuoi: null,
        thaoTacCuoi: truoc(IM_LANG_SAU_THAO_TAC_S + 10),
      },
    };

    expect(chay([muc()], state).tin).toHaveLength(1);
  });
});

describe("nhiều người", () => {
  it("mỗi người một tin riêng, state riêng", () => {
    const { tin, stateMoi } = lenKeHoach({
      nguoi: [
        { login: "pm-linh", items: [muc()] },
        { login: "tl-duc", items: [muc({ key: "shop#30", slug: "shop", number: 30 })] },
      ],
      state: { "tl-duc": { daBao: {}, lanCuoi: truoc(10), thaoTacCuoi: null } },
      goc: GOC,
      now: NOW,
    });

    expect(tin.map((t) => t.login)).toEqual(["pm-linh"]);
    expect(Object.keys(stateMoi)).toEqual(["pm-linh"]);
  });

  it("hộp thư rỗng thì không gửi gì", () => {
    expect(chay([]).tin).toEqual([]);
  });
});
