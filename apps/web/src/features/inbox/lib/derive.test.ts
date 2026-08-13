import { beforeEach, describe, expect, it } from "vitest";

import { PM, seedGithub, TL } from "@/lib/fixtures/github";
import type { Actor, GhComment, GhTask } from "@/lib/github/types";

import { deriveInbox, type InboxInput } from "./derive";

const NOW = new Date("2026-08-13T10:00:00Z");
const pm: Actor = { ...PM, role: "pm" };
const tl: Actor = { ...TL, role: "tl" };

let tasks: GhTask[];
let timelines: Record<string, GhComment[]>;

beforeEach(() => {
  const seed = seedGithub(NOW);
  tasks = seed.tasks;
  timelines = seed.timeline;
});

/** Bằng chứng có sẵn cho đúng hai PR mà fixture đã sinh file thật. */
const coBangChung = (slug: string, pr: number) =>
  (slug === "myapp" && pr === 45) || (slug === "shop" && pr === 37);

function chay(actor: Actor, patch: Partial<InboxInput> = {}) {
  return deriveInbox({
    tasks,
    timelines,
    hasEvidence: coBangChung,
    actor,
    now: NOW,
    ...patch,
  });
}

describe("năm loại mục đều dựng được", () => {
  // Cả năm loại đều dựng được từ bộ fixture. Không người nào thấy cả năm cùng
  // lúc, và đó chính là điều đang được kiểm: mục chỉ hiện với người nó chặn.
  it("bộ fixture dựng đủ cả năm loại, chia giữa hai người", () => {
    const cua = (a: Actor) => new Set(chay(a).map((i) => i.kind));

    expect(cua(pm)).toEqual(
      new Set(["duyet-spec", "cho-phep-nhan-task", "duyet-pr", "can-nguoi"]),
    );
    expect(cua(tl)).toEqual(
      new Set(["cho-phep-nhan-task", "duyet-pr", "can-nguoi", "agent-hoi-nguoc"]),
    );
    expect(new Set([...cua(pm), ...cua(tl)]).size).toBe(5);
  });

  it("duyệt spec bắt đúng issue có status:spec-review", () => {
    const specs = chay(pm).filter((i) => i.kind === "duyet-spec");

    expect(specs.map((i) => `${i.slug}#${i.number}`).sort()).toEqual(["myapp#38", "shop#12"]);
  });

  it("cho phép nhận task = có agent:build mà thiếu agent:eligible", () => {
    const items = chay(pm).filter((i) => i.kind === "cho-phep-nhan-task");

    expect(items.map((i) => `${i.slug}#${i.number}`).sort()).toEqual(["myapp#41", "shop#36"]);
    // #42 có cả hai nhãn và đang chạy — không chặn ai.
    expect(items.map((i) => i.number)).not.toContain(42);
    // #44 có cả hai nhãn, đang nằm hàng đợi của máy — cũng không chặn ai.
    expect(items.map((i) => i.number)).not.toContain(44);
  });

  it("duyệt PR cần cả bee/test xanh lẫn bằng chứng khớp SHA", () => {
    const items = chay(pm).filter((i) => i.kind === "duyet-pr");

    expect(items.map((i) => `${i.slug}#${i.number}`)).toEqual(["shop#30", "myapp#40"]);
    expect(items.every((i) => i.prUrl?.includes("/pull/"))).toBe(true);
  });

  it("không có bằng chứng thì chưa phải việc của người", () => {
    const items = chay(pm, { hasEvidence: () => false });

    expect(items.filter((i) => i.kind === "duyet-pr")).toHaveLength(0);
  });

  it("bee/test chưa xanh thì không đưa lên duyệt", () => {
    const shop30 = tasks.find((t) => t.slug === "shop" && t.number === 30)!;
    shop30.pull!.checks = [{ name: "bee/test", conclusion: "failure" }];

    expect(chay(pm).filter((i) => i.kind === "duyet-pr").map((i) => i.number)).toEqual([40]);
  });

  it("PR nháp không bao giờ lên hộp thư", () => {
    const myapp49 = tasks.find((t) => t.slug === "myapp" && t.number === 49)!;
    expect(myapp49.pull?.draft).toBe(true);

    expect(chay(pm).find((i) => i.number === 49)?.kind).not.toBe("duyet-pr");
  });

  it("cần người bắt đúng nhãn needs-human", () => {
    const items = chay(pm).filter((i) => i.kind === "can-nguoi");

    expect(items.map((i) => `${i.slug}#${i.number}`).sort()).toEqual(["blog#9", "myapp#47"]);
  });
});

describe("agent hỏi ngược", () => {
  it("chặn ở người cuối cùng đã nói chuyện, không phải ở mọi người", () => {
    // TL là người hỏi @claude ở #49, nên câu hỏi ngược chặn ở TL.
    expect(chay(tl).find((i) => i.number === 49)?.kind).toBe("agent-hoi-nguoc");
    expect(chay(pm).find((i) => i.number === 49)?.kind).not.toBe("agent-hoi-nguoc");
  });

  it("chưa ai nói thì chặn ở người mở task", () => {
    timelines["myapp#50"] = [
      {
        id: 3001,
        author: { login: "bee-orch", name: "bee (agent)", avatar_url: "" },
        body: "Task này gồm cả hoá đơn đã phát hành hay chỉ hoá đơn mới?",
        created_at: NOW.toISOString(),
        kind: "issue",
        from_agent: true,
      },
    ];

    // #50 do PM mở.
    expect(chay(pm).find((i) => i.number === 50)?.kind).toBe("agent-hoi-nguoc");
    expect(chay(tl).find((i) => i.number === 50)).toBeUndefined();
  });

  it("comment agent không kết thúc bằng dấu hỏi thì không phải câu hỏi", () => {
    // #40: agent báo đã mở PR, không hỏi gì.
    expect(chay(pm).find((i) => i.number === 40)?.kind).toBe("duyet-pr");
  });
});

describe("một task chỉ sinh một mục", () => {
  it("không có task nào xuất hiện hai lần", () => {
    for (const actor of [pm, tl]) {
      const keys = chay(actor).map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("needs-human thắng mọi lý do khác", () => {
    const myapp47 = tasks.find((t) => t.slug === "myapp" && t.number === 47)!;
    myapp47.labels = ["needs-human", "agent:build", "status:spec-review"];

    expect(chay(pm).find((i) => i.number === 47)?.kind).toBe("can-nguoi");
  });

  it("câu hỏi của agent thắng việc duyệt PR", () => {
    const shop30 = tasks.find((t) => t.slug === "shop" && t.number === 30)!;
    timelines["shop#30"] = [
      ...timelines["shop#30"],
      {
        id: 3002,
        author: { login: "bee-orch", name: "bee (agent)", avatar_url: "" },
        body: "Bảng thuế nên nạp lúc khởi động hay mỗi request?",
        created_at: NOW.toISOString(),
        kind: "issue",
        from_agent: true,
      },
    ];

    expect(shop30.pull?.draft).toBe(false);
    expect(chay(tl).find((i) => i.number === 30)?.kind).toBe("agent-hoi-nguoc");
  });
});

describe("chỉ hiện mục đang chặn người đang đăng nhập", () => {
  it("TL không nhận việc duyệt spec", () => {
    expect(chay(tl).some((i) => i.kind === "duyet-spec")).toBe(false);
    expect(chay(pm).some((i) => i.kind === "duyet-spec")).toBe(true);
  });

  it("PM được nút Duyệt, TL được đường sang GitHub", () => {
    expect(chay(pm).find((i) => i.kind === "duyet-pr")?.action.label).toBe("Approve");
    expect(chay(tl).find((i) => i.kind === "duyet-pr")?.action.label).toBe("View PR");
  });

  it("người đã approve rồi thì PR đó rời khỏi hộp thư của họ", () => {
    // TL đã approve shop#30 trong fixture.
    expect(chay(tl).some((i) => i.number === 30 && i.kind === "duyet-pr")).toBe(false);
    expect(chay(pm).some((i) => i.number === 30 && i.kind === "duyet-pr")).toBe(true);
  });
});

describe("thứ tự", () => {
  it("chờ lâu nhất lên đầu", () => {
    const waits = chay(pm).map((i) => i.waitingS);

    expect(waits).toEqual([...waits].sort((a, b) => b - a));
    expect(waits.length).toBeGreaterThan(3);
  });

  it("mục chờ 26 giờ đứng trên mục chờ 1 giờ", () => {
    const items = chay(pm);
    const blog9 = items.findIndex((i) => i.slug === "blog" && i.number === 9);
    const shop12 = items.findIndex((i) => i.slug === "shop" && i.number === 12);

    expect(blog9).toBeLessThan(shop12);
  });

  it("priority:high hiện thành nhãn chứ không chen chỗ", () => {
    const items = chay(pm);
    const shop36 = items.find((i) => i.number === 36 && i.slug === "shop");

    expect(shop36?.priority).toBe(true);
    // shop#36 chờ 2h40m, myapp#47 chờ 6h40m — thứ tự theo thời gian, không theo nhãn.
    expect(items.findIndex((i) => i.number === 47)).toBeLessThan(items.indexOf(shop36!));
  });
});

describe("rỗng", () => {
  it("không có task nào thì trả mảng rỗng, không ném lỗi", () => {
    expect(deriveInbox({ tasks: [], timelines: {}, hasEvidence: () => false, actor: pm })).toEqual(
      [],
    );
  });

  it("task đã đóng không lên hộp thư", () => {
    for (const t of tasks) t.state = "closed";
    expect(chay(pm)).toEqual([]);
  });
});
