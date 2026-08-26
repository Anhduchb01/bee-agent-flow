import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { allocatePortRange } from "./ports";

const isOpen: net.Server[] = [];

async function chiem(port: number): Promise<void> {
  await new Promise<void>((res, rej) => {
    const s = net.createServer();
    s.once("error", rej);
    s.listen(port, "127.0.0.1", () => {
      isOpen.push(s);
      res();
    });
  });
}

afterEach(async () => {
  await Promise.all(isOpen.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe("allocatePortRange — hai phiên cùng repo không được đụng cổng nhau", () => {
  it("dải đầu tiên còn trống thì lấy luôn", async () => {
    const base = await allocatePortRange({ since: 54000, count: 10, daDung: [] });
    expect(base).toBe(54000);
  });

  it("cổng đang bị CHIẾM THẬT thì nhảy sang dải sau", async () => {
    await chiem(54003); // giữa dải đầu
    const base = await allocatePortRange({ since: 54000, count: 10, daDung: [] });
    expect(base).toBe(54010);
  });

  it("tránh cả dải mà phiên khác đã GIỮ CHỖ dù chưa listen", async () => {
    // Phiên đang chạy nhưng compose chưa lên: cổng chưa ai bind, nhưng dải đó
    // đã là của nó. Bind-test một mình sẽ cấp trùng.
    const base = await allocatePortRange({ since: 54000, count: 10, daDung: [54000, 54010] });
    expect(base).toBe(54020);
  });

  it("hết dải trong phạm vi → null, không quay vòng đè lên dải của người khác", async () => {
    const base = await allocatePortRange({ since: 54000, count: 10, den: 54019, daDung: [54000, 54010] });
    expect(base).toBeNull();
  });
});
