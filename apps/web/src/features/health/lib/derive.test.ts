import { describe, expect, it } from "vitest";

import type { StatusRead } from "@/lib/bee/types";
import { sceneStatus, type SceneId } from "@/lib/fixtures/bee";

import { deriveHealth } from "./derive";

const NOW = new Date("2026-08-13T10:00:00Z");
const read = (scene: SceneId): StatusRead => ({
  ok: true,
  status: sceneStatus(scene, NOW),
  dropped: 0,
});
/** A scene with one field bent, to pin a threshold the scenes do not cover. */
const bent = (scene: SceneId, patch: Partial<ReturnType<typeof sceneStatus>>): StatusRead => ({
  ok: true,
  status: { ...sceneStatus(scene, NOW), ...patch },
  dropped: 0,
});

describe("deriveHealth — ba chỗ hỏng im lặng", () => {
  // 1. Chế độ hỏng nguy hiểm nhất: không có gì đỏ để nhìn, chỉ là không có gì
  //    xảy ra. Nếu app không nói ra thì không ai biết.
  it("heartbeat cũ 35 phút → báo đỏ và nói rõ các con số là cũ", () => {
    const h = deriveHealth(read("runner-dead"), NOW);

    expect(h.level).toBe("down");
    expect(h.headline).toContain("may be dead");
    expect(h.detail).toContain("35 minutes");
    expect(h.detail).toContain("stale");
  });

  it("heartbeat 30 phút → vẫn là đỏ (ngưỡng 10 phút)", () => {
    const at = new Date(NOW.getTime() - 30 * 60_000).toISOString();

    expect(deriveHealth(bent("normal", { heartbeat: at }), NOW).level).toBe("down");
  });

  it("heartbeat 9 phút → chưa đỏ", () => {
    const at = new Date(NOW.getTime() - 9 * 60_000).toISOString();

    expect(deriveHealth(bent("normal", { heartbeat: at }), NOW).level).toBe("ok");
  });

  it("heartbeat không phải ngày tháng cũng tính là chết, không đoán tốt", () => {
    const h = deriveHealth(bent("normal", { heartbeat: "hôm qua" }), NOW);
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
    const h = deriveHealth(
      { ok: false, reason: "malformed", detail: "heartbeat.json is not JSON" },
      NOW,
    );

    expect(h.level).toBe("down");
    expect(h.headline).toContain("Cannot read system status");
    expect(h.detail).toContain("malformed");
  });
});

describe("deriveHealth — đếm và cảnh báo", () => {
  it("đếm đúng ở cảnh bình thường", () => {
    const h = deriveHealth(read("normal"), NOW);

    expect(h.level).toBe("ok");
    expect(h.running).toBe(1);
  });

  it("đếm đúng khi máy đầy tải", () => {
    const h = deriveHealth(read("under-load"), NOW);

    expect(h.running).toBe(4);
  });

  it("kill switch bật dù đã có repo → cảnh báo, không phải xanh", () => {
    const h = deriveHealth(read("something-wrong"), NOW);

    expect(h.level).toBe("warn");
    expect(h.headline).toContain("paused");
    expect(h.running).toBe(1);
  });

  it("máy vừa cài cũng đang paused — cùng một công tắc", () => {
    const h = deriveHealth(read("fresh-install"), NOW);

    expect(h.level).toBe("warn");
    expect(h.headline).toContain("paused");
  });

  it("chưa có repo nào thì nói bước tiếp theo thay vì hiện số 0", () => {
    const h = deriveHealth(bent("fresh-install", { mode: "running" }), NOW);
    expect(h.level).toBe("ok");
    expect(h.detail).toContain("be repo add");
  });

  it("repo đọc không được bị đếm và hiện ra, không giấu", () => {
    const h = deriveHealth({ ...read("normal"), dropped: 1 } as StatusRead, NOW);

    expect(h.dropped).toBe(1);
  });
});
