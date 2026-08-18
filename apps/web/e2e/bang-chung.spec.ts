import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

const GOC = "/api/evidence";

test("file bằng chứng hợp lệ tải được, đúng content-type", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  const res = await page.request.get(`${GOC}/myapp/45/9f3c1ab/loc-don-theo-trang-thai.gif`);

  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/gif");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await res.body()).subarray(0, 6).toString("latin1")).toBe("GIF89a");
});

test("đọc được file trong thư mục con", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  const res = await page.request.get(
    `${GOC}/myapp/45/9f3c1ab/shots/loc-don-theo-trang-thai-1.png`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

/**
 * Đây là lỗ hổng, không phải tính năng.
 *
 * App chạy dưới `bee-web` thuộc group `bee`. Một `../../` lọt qua là đọc được
 * `/etc/bee/orch.env` — token của orchestrator — và mọi `claim.json` dưới
 * `state/`. Vì vậy nó có test từ trước khi có route.
 */
test.describe("chặn đường thoát ra ngoài gốc bằng chứng", () => {
  const duongXau = [
    "../../etc/bee/orch.env",
    "myapp/../../../etc/bee/orch.env",
    "myapp/45/../../../state/myapp-42/claim.json",
    "%2e%2e/%2e%2e/etc/bee/orch.env",
    "..%2f..%2fetc%2fbee%2forch.env",
    "myapp/45/9f3c1ab/../../../../../../etc/passwd",
  ];

  for (const duong of duongXau) {
    test(`từ chối ${duong}`, async ({ page }) => {
      await dangNhap(page, "pm-linh");

      const res = await page.request.get(`${GOC}/${duong}`, { maxRedirects: 0 });

      expect(res.status()).toBeGreaterThanOrEqual(400);
      const body = await res.text();
      expect(body).not.toContain("GH_TOKEN");
      expect(body).not.toContain("root:");
      expect(body).not.toContain("claim");
    });
  }
});

test("chưa đăng nhập thì không đọc được một byte nào", async ({ browser }) => {
  const context = await browser.newContext();
  const res = await context.request.get(
    `http://127.0.0.1:3187${GOC}/myapp/45/9f3c1ab/loc-don-theo-trang-thai.gif`,
    { maxRedirects: 0 },
  );

  // 401 chứ không phải một trang HTML đăng nhập: /api/** không đi qua proxy.
  expect(res.status()).toBe(401);
  await context.close();
});

test("người ngoài allowlist cũng không đọc được", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("GitHub login").fill("nguoi-la");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("do not have access");

  const res = await page.request.get(`${GOC}/myapp/45/9f3c1ab/loc-don-theo-trang-thai.gif`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
});
