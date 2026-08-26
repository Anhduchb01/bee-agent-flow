import path from "node:path";

import { test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * Không phải bài test — đây là cái máy chụp ảnh phục vụ W12 (người duyệt giao
 * diện qua đủ năm cảnh dữ liệu).
 *
 * Nó nằm chung `testDir` để dùng lại đúng một `webServer` và đúng một helper
 * đăng nhập; nếu tách ra config riêng thì bản build được chụp và bản build được
 * test có thể khác nhau, và ảnh sẽ nói về một sản phẩm không ai đang chạy.
 *
 * Mặc định BỎ QUA. Bật bằng `CHUP_ANH=<thư mục>` — ảnh không rơi vào repo, vì
 * hai mươi mấy tấm JPEG lẫn vào lịch sử git là cái giá phải trả mãi mãi cho một
 * lần duyệt.
 */
const OUT_DIR = process.env.CHUP_ANH;

/** Ảnh chụp phải tất định: giờ đồng hồ đổi thì mọi tấm đều "khác" lần trước. */
const ACTOR = "pm-linh";

type Screen = { name: string; url: string; open?: (p: Page) => Promise<void> };

/** Các màn mà cảnh dữ liệu thực sự làm đổi nội dung. */
const SCENE_SCREENS: Screen[] = [
  { name: "01-overview", url: "/" },
  { name: "03-projects", url: "/projects" },
  { name: "04-projects-kanban", url: "/projects?view=kanban" },
];

/**
 * Các màn KHÔNG phụ thuộc cảnh: kho fixture GitHub chỉ có một, cảnh chỉ đổi
 * `status.json`. Chụp một lần ở cảnh bình thường thay vì nhân năm lần cùng một
 * tấm ảnh — hai mươi tấm giống hệt nhau làm người duyệt bỏ qua cả bộ.
 */
const ONCE_SCREENS: Screen[] = [
  { name: "06-projects-filtered", url: "/projects?p=myapp" },
  { name: "10-setup-config", url: "/setup?tab=config" },
];

const SCENES = [
  "binh-thuong",
  "day-tai",
  "co-su-co",
  "reconciler-chet",
  "vua-cai",
  // Hai cảnh hỏng: không nằm trong "năm cảnh" của W12 nhưng là chỗ giao diện dễ
  // vỡ nhất, và xem ảnh rẻ hơn nhiều so với gặp nó trên máy thật.
  //
  // Tên phải khớp ĐÚNG chuỗi `fixture.ts` kiểm tra. Gõ sai thì `sceneId()` rơi
  // êm về "binh-thuong" và ta được một tấm ảnh dán nhãn "hỏng" nhưng chụp một
  // dashboard khoẻ mạnh — sai lầm tệ hơn cả không chụp.
  "chua-co-file",
  "json-hong",
] as const;

async function setScene(page: Page, scene: string) {
  await page.context().addCookies([
    { name: "bee-scene", value: scene, url: "http://127.0.0.1:3187" },
  ]);
}

async function shoot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT_DIR!, `${name}.jpg`),
    fullPage: true,
    type: "jpeg",
    quality: 82,
  });
}

test.describe("UI review screenshots", () => {
  test.skip(!OUT_DIR, "set CHUP_ANH=<dir> to enable");
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const scene of SCENES) {
    test(`scene ${scene}`, async ({ page }) => {
      await signIn(page, ACTOR);
      await setScene(page, scene);

      for (const screen of SCENE_SCREENS) {
        await page.goto(screen.url);
        await page.waitForLoadState("networkidle");
        await shoot(page, `${scene}__${screen.name}`);
      }
    });
  }

  test("screens that do not depend on the scene", async ({ page }) => {
    await signIn(page, ACTOR);
    await setScene(page, "binh-thuong");

    for (const screen of ONCE_SCREENS) {
      await page.goto(screen.url);
      await page.waitForLoadState("networkidle");
      await screen.open?.(page);
      await shoot(page, `normal__${screen.name}`);
    }
  });

  test("phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ACTOR);
    await setScene(page, "binh-thuong");

    for (const screen of SCENE_SCREENS) {
      await page.goto(screen.url);
      await page.waitForLoadState("networkidle");
      await shoot(page, `phone__${screen.name}`);
    }
  });

  test("someone outside the allowlist", async ({ page }) => {
    await signIn(page, "khach-la");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await shoot(page, "quyen__09-nguoi-ngoai");
  });
});
