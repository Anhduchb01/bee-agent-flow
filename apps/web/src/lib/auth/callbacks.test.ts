import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fillSession, fillToken } from "./callbacks";

const env = { ...process.env };

beforeEach(() => {
  process.env.GITHUB_SOURCE = "fixture";
  delete process.env.ALLOWED_LOGINS;
  delete process.env.BEE_TL_LOGINS;
});

afterEach(() => {
  process.env = { ...env };
});

describe("fillToken", () => {
  it("lấy login từ profile GitHub", () => {
    const token = fillToken(
      {},
      {
        profile: { login: "pm-linh", name: "Nguyễn Thị Linh", avatar_url: "https://x/a.png" },
        accessToken: "gho_bimat",
      },
    );

    expect(token.login).toBe("pm-linh");
    expect(token.displayName).toBe("Nguyễn Thị Linh");
    expect(token.access_token).toBe("gho_bimat");
  });

  it("lấy login từ provider giả khi không có profile", () => {
    const token = fillToken({}, { user: { login: "tl-duc", name: "Phạm Đức" } });

    expect(token.login).toBe("tl-duc");
    expect(token.access_token).toBeUndefined();
  });

  it("giữ nguyên token cũ khi refresh, không xoá mất login", () => {
    const token = fillToken({ login: "pm-linh", access_token: "gho_bimat" }, {});

    expect(token.login).toBe("pm-linh");
    expect(token.access_token).toBe("gho_bimat");
  });
});

describe("fillSession", () => {
  it("người trong allowlist thấy tên mình và đúng vai trò", () => {
    const s = fillSession({}, { login: "pm-linh", displayName: "Nguyễn Thị Linh" });

    expect(s.login).toBe("pm-linh");
    expect(s.displayName).toBe("Nguyễn Thị Linh");
    expect(s.allowed).toBe(true);
    expect(s.role).toBe("pm");
  });

  it("techlead nhận vai trò tl", () => {
    expect(fillSession({}, { login: "tl-duc" }).role).toBe("tl");
  });

  it("người ngoài allowlist vẫn có session, nhưng allowed = false", () => {
    const s = fillSession({}, { login: "nguoi-la", displayName: "Người Lạ" });

    expect(s.login).toBe("nguoi-la");
    expect(s.allowed).toBe(false);
  });

  // Bài test canh gác. Nó không kiểm một tính năng — nó kiểm một dòng duy nhất
  // mà ai đó có thể vô hiệu hoá bằng một lần spread đặt nhầm chỗ.
  it("KHÔNG có token nào trong payload đi ra client", () => {
    const s = fillSession(
      {},
      {
        login: "pm-linh",
        access_token: "gho_bimat",
        accessToken: "gho_bimat",
      },
    );

    const json = JSON.stringify(s);
    expect(json).not.toContain("gho_bimat");
    expect(json).not.toContain("access_token");
    expect(Object.keys(s)).not.toContain("access_token");
  });

  it("cắt cả khi session đã lỡ mang sẵn token từ chỗ khác", () => {
    const s = fillSession({ access_token: "gho_bimat" }, { login: "pm-linh" });

    expect(JSON.stringify(s)).not.toContain("gho_bimat");
  });

  it("session không có login thì không được phép vào", () => {
    expect(fillSession({}, {}).allowed).toBe(false);
  });
});
