import "server-only";

import net from "node:net";

/**
 * Cấp một DẢI cổng liên tiếp cho phiên (V3.T14).
 *
 * Vì sao không dùng công thức tĩnh `54000 + num`: hai repo khác nhau có thể
 * cùng `num`, và cổng có thể đã bị thứ khác trên máy chiếm (máy này đang chạy
 * sẵn postgres/redis/rabbit/minio của chủ dự án). Quét thật rồi mới cấp.
 *
 * Hai điều kiện, cần cả hai:
 *  · **không ai đang listen** — thử bind, cách duy nhất biết chắc;
 *  · **chưa phiên nào giữ chỗ** — phiên vừa mở mà compose chưa lên thì cổng
 *    còn trống, nhưng dải đó đã là của nó. Chỉ bind-test là cấp trùng.
 */

function conTrong(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = net.createServer();
    s.once("error", () => res(false));
    s.listen(port, "127.0.0.1", () => s.close(() => res(true)));
  });
}

export async function allocatePortRange(opts: {
  tu?: number;
  den?: number;
  so?: number;
  /** Dải các phiên khác đang giữ — đọc từ session.json của chúng. */
  daDung: number[];
}): Promise<number | null> {
  const tu = opts.tu ?? 54000;
  const den = opts.den ?? 54990;
  const so = opts.so ?? 10;
  const giu = new Set(opts.daDung);

  for (let base = tu; base + so - 1 <= den; base += so) {
    if (giu.has(base)) continue;
    let trong = true;
    for (let p = base; p < base + so; p += 1) {
      if (!(await conTrong(p))) {
        trong = false;
        break;
      }
    }
    if (trong) return base;
  }
  // Hết dải: trả null để người gọi nói thật, thay vì quay vòng đè lên dải của
  // phiên khác — đụng cổng lúc 2 giờ sáng là loại lỗi khó lần nhất.
  return null;
}
