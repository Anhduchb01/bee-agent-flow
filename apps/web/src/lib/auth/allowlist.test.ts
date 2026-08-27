import { describe, expect, it } from "vitest";

import { allowedLogins, isAllowed, roleOf } from "./allowlist";

const live = { GITHUB_SOURCE: "live" };
const fixture = { GITHUB_SOURCE: "fixture" };

describe("allowedLogins", () => {
  it("đọc danh sách từ biến môi trường", () => {
    expect(allowedLogins({ ALLOWED_LOGINS: "pm-linh, TL-Duc ,, " })).toEqual([
      "pm-linh",
      "tl-duc",
    ]);
  });

  // Đây là mặc định quan trọng nhất trong file này. Mở sẵn khi thiếu cấu hình
  // là kiểu lỗi chỉ lộ ra sau khi đã có người lạ ở trong.
  it("rỗng trên dữ liệu thật nghĩa là không ai vào được", () => {
    expect(allowedLogins(live)).toEqual([]);
    expect(isAllowed("bat-ky-ai", live)).toBe(false);
  });

  it("rỗng trên fixture thì hai người dùng mẫu là allowlist", () => {
    expect(allowedLogins(fixture)).toEqual(["pm-linh", "tl-duc"]);
    expect(isAllowed("pm-linh", fixture)).toBe(true);
    expect(isAllowed("stranger", fixture)).toBe(false);
  });

  it("so sánh không phân biệt hoa thường và bỏ khoảng trắng", () => {
    const env = { ALLOWED_LOGINS: "PM-Linh" };
    expect(isAllowed("  pm-linh ", env)).toBe(true);
  });
});

describe("roleOf", () => {
  it("đọc BEE_TL_LOGINS", () => {
    const env = { BEE_TL_LOGINS: "tl-duc,ai-do" };
    expect(roleOf("tl-duc", env)).toBe("tl");
    expect(roleOf("pm-linh", env)).toBe("pm");
  });

  it("mặc định là pm khi không cấu hình gì", () => {
    expect(roleOf("newcomer", live)).toBe("pm");
  });

  it("trên fixture thì tl-duc là techlead", () => {
    expect(roleOf("tl-duc", fixture)).toBe("tl");
    expect(roleOf("pm-linh", fixture)).toBe("pm");
  });
});
