import { describe, expect, it } from "vitest";

import { resolveEvidencePath } from "./evidence-path";

const ROOT = "/srv/bee/evidence";

describe("resolveEvidencePath", () => {
  it("cho qua đường dẫn hợp lệ", () => {
    expect(resolveEvidencePath(ROOT, ["myapp", "42", "9f3c1ab", "results.json"])).toBe(
      "/srv/bee/evidence/myapp/42/9f3c1ab/results.json",
    );
  });

  it("cho qua thư mục con", () => {
    expect(
      resolveEvidencePath(ROOT, ["myapp", "42", "9f3c1ab", "shots", "loc-don-1.png"]),
    ).toBe("/srv/bee/evidence/myapp/42/9f3c1ab/shots/loc-don-1.png");
  });

  // Đây là lỗ hổng, không phải tính năng — nên nó có test trước khi có route.
  it.each([
    [["..", "..", "etc", "bee", "orch.env"]],
    [["myapp", "..", "..", "..", "etc", "bee", "orch.env"]],
    [["myapp", "42", "..", "..", "..", "state", "myapp-42", "claim.json"]],
    [["."]],
    [[".."]],
  ])("từ chối đường thoát ra ngoài gốc: %j", (segments) => {
    expect(resolveEvidencePath(ROOT, segments)).toBeNull();
  });

  it("từ chối đường dẫn tuyệt đối", () => {
    expect(resolveEvidencePath(ROOT, ["/etc/bee/orch.env"])).toBeNull();
  });

  it("từ chối byte NUL và dấu gạch chéo lẫn trong một đoạn", () => {
    expect(resolveEvidencePath(ROOT, ["myapp", "42/../.."])).toBeNull();
    expect(resolveEvidencePath(ROOT, ["myapp\0.png"])).toBeNull();
  });

  it("từ chối đoạn rỗng và danh sách rỗng", () => {
    expect(resolveEvidencePath(ROOT, [])).toBeNull();
    expect(resolveEvidencePath(ROOT, ["myapp", "", "x"])).toBeNull();
  });

  // %2e%2e đã được Next giải mã trước khi tới đây, nhưng nếu một lớp nào đó
  // quên giải mã thì chuỗi thô cũng không được phép lọt.
  it("từ chối chuỗi đã mã hoá còn sót", () => {
    expect(resolveEvidencePath(ROOT, ["%2e%2e", "etc"])).toBeNull();
  });
});
