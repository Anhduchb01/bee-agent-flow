import { describe, expect, it } from "vitest";

import { parseStatus } from "@/lib/bee/parse";
import { sceneJson } from "@/lib/fixtures/bee";

import { deriveHealth } from "./derive";

const NOW = new Date("2026-08-13T10:00:00Z");
const read = (scene: Parameters<typeof sceneJson>[0]) => parseStatus(sceneJson(scene, NOW));

describe("deriveHealth — ba chỗ hỏng im lặng", () => {
  // 1. Chế độ hỏng nguy hiểm nhất: không có gì đỏ để nhìn, chỉ là không có gì
  //    xảy ra. Nếu app không nói ra thì không ai biết.
  it("heartbeat cũ 35 phút → báo đỏ và nói rõ các con số là cũ", () => {
    const h = deriveHealth(read("reconciler-chet"), NOW);

    expect(h.level).toBe("down");
    expect(h.headline).toContain("may be dead");
    expect(h.detail).toContain("35 minutes");
    expect(h.detail).toContain("stale");
  });

  it("heartbeat 30 phút → vẫn là đỏ (ngưỡng 10 phút)", () => {
    const status = JSON.parse(sceneJson("binh-thuong", NOW));
    status.heartbeat = new Date(NOW.getTime() - 30 * 60_000).toISOString();

    expect(deriveHealth(parseStatus(JSON.stringify(status)), NOW).level).toBe("down");
  });

  it("heartbeat 9 phút → chưa đỏ", () => {
    const status = JSON.parse(sceneJson("binh-thuong", NOW));
    status.heartbeat = new Date(NOW.getTime() - 9 * 60_000).toISOString();

    expect(deriveHealth(parseStatus(JSON.stringify(status)), NOW).level).toBe("ok");
  });

  it("heartbeat không phải ngày tháng cũng tính là chết, không đoán tốt", () => {
    const status = JSON.parse(sceneJson("binh-thuong", NOW));
    status.heartbeat = "hôm qua";

    const h = deriveHealth(parseStatus(JSON.stringify(status)), NOW);
    expect(h.level).toBe("down");
    expect(h.heartbeatAgeS).toBeNull();
  });

  // 2. File thiếu là trạng thái bình thường sau khi cài, không phải sự cố.
  it("thiếu file → báo rõ, không crash, và không phải màu đỏ", () => {
    const h = deriveHealth({ ok: false, reason: "missing", detail: "chưa tồn tại" }, NOW);

    expect(h.level).toBe("warn");
    expect(h.headline).toContain("No data from the runner");
    expect(h.running).toBe(0);
  });

  // 3. JSON hỏng: đang ghi dở, hoặc runner đổi hình dạng.
  it("JSON hỏng → báo đỏ kèm lý do, không crash", () => {
    const h = deriveHealth(parseStatus("{hỏng"), NOW);

    expect(h.level).toBe("down");
    expect(h.headline).toContain("Cannot read system status");
    expect(h.detail).toContain("malformed");
  });
});

describe("deriveHealth — đếm và cảnh báo", () => {
  it("đếm đúng ở cảnh bình thường", () => {
    const h = deriveHealth(read("binh-thuong"), NOW);

    expect(h.level).toBe("ok");
    expect(h.running).toBe(1);
  });

  it("đếm đúng khi máy đầy tải", () => {
    const h = deriveHealth(read("day-tai"), NOW);

    expect(h.running).toBe(4);
  });

  it("repo bị dừng thì cảnh báo và gọi tên nó ra", () => {
    const h = deriveHealth(read("co-su-co"), NOW);

    expect(h.level).toBe("warn");
    expect(h.pausedRepos).toEqual(["shop"]);
    expect(h.detail).toContain("shop");
    expect(h.detail).toContain(".agent/PAUSE");
  });

  it("mode paused thắng cả cảnh báo repo", () => {
    const h = deriveHealth(read("vua-cai"), NOW);

    expect(h.level).toBe("warn");
    expect(h.headline).toContain("paused");
  });

  it("chưa có repo nào thì nói bước tiếp theo thay vì hiện số 0", () => {
    const status = JSON.parse(sceneJson("vua-cai", NOW));
    status.mode = "running";

    const h = deriveHealth(parseStatus(JSON.stringify(status)), NOW);
    expect(h.level).toBe("ok");
    expect(h.detail).toContain("be repo add");
  });

  it("repo hỏng hình dạng bị đếm và hiện ra, không giấu", () => {
    const status = JSON.parse(sceneJson("binh-thuong", NOW));
    status.repos.push({ slug: "hỏng" });

    expect(deriveHealth(parseStatus(JSON.stringify(status)), NOW).dropped).toBe(1);
  });
});
