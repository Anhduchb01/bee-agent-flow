import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBee, resetBeeSource } from "./index";

const env = { ...process.env };

beforeEach(() => {
  resetBeeSource();
  process.env.BEE_SOURCE = "fixture";
  delete process.env.BEE_FIXTURE_SCENE;
});

afterEach(() => {
  process.env = { ...env };
  resetBeeSource();
});

describe("getBee — fixture", () => {
  it("mặc định là cảnh bình thường", async () => {
    const read = await getBee().readStatus();

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.repos.map((r) => r.slug)).toEqual(["myapp", "shop"]);
  });

  it("đổi cảnh bằng biến môi trường, không bằng tham số của UI", async () => {
    process.env.BEE_FIXTURE_SCENE = "vua-cai";
    resetBeeSource();

    const read = await getBee().readStatus();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.status.repos).toEqual([]);
    expect(read.status.mode).toBe("paused");
  });

  it("cảnh reconciler-chet cho heartbeat luôn cũ, bất kể chạy ngày nào", async () => {
    process.env.BEE_FIXTURE_SCENE = "reconciler-chet";
    resetBeeSource();

    const read = await getBee().readStatus();
    if (!read.ok) throw new Error("phải parse được");
    const ageS = (Date.now() - Date.parse(read.status.heartbeat)) / 1000;
    expect(ageS).toBeGreaterThan(600);
    expect(ageS).toBeLessThan(3600);
  });

  it("dựng được cả hai kết cục hỏng của việc đọc file", async () => {
    process.env.BEE_FIXTURE_SCENE = "chua-co-file";
    resetBeeSource();
    expect(await getBee().readStatus()).toMatchObject({ ok: false, reason: "missing" });

    process.env.BEE_FIXTURE_SCENE = "json-hong";
    resetBeeSource();
    expect(await getBee().readStatus()).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("recent xếp mới nhất trước", async () => {
    const recent = await getBee().readRecent();

    expect(recent.length).toBeGreaterThan(1);
    const times = recent.map((r) => Date.parse(r.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it.each(["vua-cai", "chua-co-file"])(
    "cảnh %s chưa từng chạy gì nên lịch sử phải rỗng",
    async (activeScene) => {
      /*
       * `vua-cai` chưa đăng ký repo nào và `chua-co-file` thì `status.json` còn
       * chưa tồn tại — cả hai đều là máy chưa chạy lần nào. Trả về bảy ngày
       * lịch sử ở đó là dựng một cảnh tự mâu thuẫn: người duyệt giao diện nhìn
       * "0 dự án" ngay cạnh "13 lần chạy hôm nay" và không tin được màn nào nữa.
       */
      process.env.BEE_FIXTURE_SCENE = activeScene;
      resetBeeSource();

      expect(await getBee().readRecent()).toEqual([]);
    },
  );
});

describe("getBee — bằng chứng", () => {
  it("đọc được file thật kèm đúng content-type", async () => {
    const file = await getBee().readEvidenceFile([
      "myapp",
      "45",
      "9f3c1ab",
      "loc-don-theo-trang-thai.gif",
    ]);

    expect(file).not.toBeNull();
    expect(file?.contentType).toBe("image/gif");
    // GIF89a — file thật, không phải byte bịa.
    expect(Buffer.from(file!.bytes.slice(0, 6)).toString("latin1")).toBe("GIF89a");
  });

  // Cùng một hàm chặn được dùng cho cả fixture lẫn đĩa thật, nên bài này cũng
  // là bài test cho đường chạy thật.
  it("từ chối đường thoát ra ngoài gốc bằng chứng", async () => {
    expect(
      await getBee().readEvidenceFile(["..", "..", "..", "etc", "bee", "orch.env"]),
    ).toBeNull();
    expect(await getBee().readEvidenceFile(["myapp", "..", "..", "bee"])).toBeNull();
  });
});

describe("getBee — chọn nguồn", () => {
  it("BEE_SOURCE=disk cho ra một nguồn khác", async () => {
    process.env.BEE_SOURCE = "disk";
    process.env.BEE_SRV = "/khong-ton-tai-o-dau-ca";
    resetBeeSource();

    // Không có máy thật ở đây; điều duy nhất kiểm được — và là điều quan trọng —
    // là nó đọc chỗ khác và báo thiếu file thay vì ném lỗi ra màn hình.
    expect(await getBee().readStatus()).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("kiểu của heartbeat", () => {
  it("gọi được isHeartbeatStale với heartbeat rác mà không ném lỗi", async () => {
    const { isHeartbeatStale } = await import("./heartbeat");
    expect(isHeartbeatStale("không phải ngày tháng")).toBe(true);
  });
});
