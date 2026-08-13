import { beforeEach, describe, expect, it } from "vitest";

import { PM, TL } from "@/lib/fixtures/github";

import { createFixtureGithubSource, resetGithubFixture } from "./fixture";
import type { Actor } from "./types";

const pm: Actor = { ...PM, role: "pm" };
const tl: Actor = { ...TL, role: "tl" };

let gh = createFixtureGithubSource();

beforeEach(() => {
  resetGithubFixture();
  gh = createFixtureGithubSource();
});

describe("đọc", () => {
  it("liệt kê ba repo theo tên", async () => {
    expect((await gh.listRepos()).map((r) => r.slug)).toEqual(["blog", "myapp", "shop"]);
  });

  it("gộp issue và PR liên kết thành một task", async () => {
    const task = await gh.getTask("myapp", 40);

    expect(task?.title).toBe("Lọc đơn hàng theo trạng thái");
    expect(task?.pull?.number).toBe(45);
    expect(task?.pull?.head_sha).toBe("9f3c1ab");
    expect(task?.pull?.checks).toContainEqual({ name: "bee/test", conclusion: "success" });
  });

  it("trả null cho task không có, không ném lỗi", async () => {
    expect(await gh.getTask("myapp", 9999)).toBeNull();
    expect(await gh.getTask("khong-co-repo", 1)).toBeNull();
  });

  it("dòng thời gian xếp theo thời gian thật, cũ trước", async () => {
    const timeline = await gh.listTimeline("myapp", 49);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].author.login).toBe("tl-duc");
    expect(timeline[1].from_agent).toBe(true);
    expect(Date.parse(timeline[0].created_at)).toBeLessThan(Date.parse(timeline[1].created_at));
  });

  it("mọi nhãn trong fixture đều thuộc bộ từ vựng thật của reconciler", async () => {
    const KNOWN = new Set([
      "agent:eligible",
      "agent:build",
      "agent:running",
      "agent:built",
      "needs-human",
      "priority:high",
      "preview:on",
      "status:draft",
      "status:ready-for-spec",
      "status:spec-review",
    ]);

    for (const task of await gh.listTasks()) {
      for (const label of task.labels) expect(KNOWN).toContain(label);
    }
  });

  it("không sửa được store qua object trả về", async () => {
    const task = await gh.getTask("myapp", 40);
    task!.labels.push("needs-human");

    expect((await gh.getTask("myapp", 40))?.labels).not.toContain("needs-human");
  });
});

describe("ghi", () => {
  it("tạo task mang tên người tạo và gắn status:ready-for-spec", async () => {
    const created = await gh.createTask(
      {
        slug: "myapp",
        title: "Thêm tìm kiếm theo mã đơn",
        goal: "Người vận hành tìm đơn bằng mã.",
        acceptance: "- [ ] Given mã đơn, When gõ vào ô tìm, Then đơn đó hiện ra.",
        constraints: "- Không đụng module thanh toán.",
        out_of_scope: "- Không làm tìm kiếm mờ.",
        ui_reference: "Ô tìm kiếm trên đầu bảng.",
      },
      pm,
    );

    expect(created.number).toBe(51);
    expect(created.author.login).toBe("pm-linh");
    expect(created.labels).toEqual(["status:ready-for-spec"]);
    // Năm mục phải nằm nguyên trong body — đây là hợp đồng rule 08 đọc.
    for (const heading of [
      "### Mục tiêu",
      "### Acceptance Criteria",
      "### Ràng buộc kỹ thuật",
      "### Out of scope",
      "### UI Reference",
    ]) {
      expect(created.body).toContain(heading);
    }
    expect(await gh.getTask("myapp", 51)).not.toBeNull();
  });

  it("cấp số issue riêng cho từng repo", async () => {
    const base = {
      title: "x",
      goal: "x",
      acceptance: "x",
      constraints: "x",
      out_of_scope: "x",
      ui_reference: "x",
    };
    expect((await gh.createTask({ ...base, slug: "shop" }, pm)).number).toBe(38);
    expect((await gh.createTask({ ...base, slug: "blog" }, pm)).number).toBe(10);
    expect((await gh.createTask({ ...base, slug: "shop" }, pm)).number).toBe(39);
  });

  it("comment mang tên người gửi và vào cuối dòng thời gian", async () => {
    const before = await gh.listTimeline("myapp", 38);
    await gh.addComment("myapp", 38, "URL nhé, để gửi link cho nhau được.", pm);

    const after = await gh.listTimeline("myapp", 38);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.author.login).toBe("pm-linh");
    expect(after.at(-1)?.from_agent).toBe(false);
  });

  it("approve mang tên người bấm và không lặp lại", async () => {
    await gh.approve("shop", 30, pm);
    await gh.approve("shop", 30, pm);

    const task = await gh.getTask("shop", 30);
    const approvals = task?.pull?.reviews.filter((r) => r.state === "APPROVED") ?? [];
    expect(approvals.map((r) => r.author.login).sort()).toEqual(["pm-linh", "tl-duc"]);
  });

  it("từ chối approve task chưa có PR", async () => {
    await expect(gh.approve("myapp", 38, pm)).rejects.toThrow(/chưa có PR/);
  });

  it("gắn và gỡ nhãn", async () => {
    expect((await gh.addLabel("myapp", 41, "agent:eligible", tl)).labels).toContain(
      "agent:eligible",
    );
    expect((await gh.removeLabel("myapp", 38, "status:spec-review", pm)).labels).not.toContain(
      "status:spec-review",
    );
  });

  it("không có cách nào merge một PR từ seam này", () => {
    const keys = Object.keys(gh);
    expect(keys.some((k) => /merge/i.test(k))).toBe(false);
  });
});
