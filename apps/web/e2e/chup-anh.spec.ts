import path from "node:path";

import { test, type Page } from "@playwright/test";

import { dangNhap } from "./helpers";

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
const THU_MUC = process.env.CHUP_ANH;

/** Ảnh chụp phải tất định: giờ đồng hồ đổi thì mọi tấm đều "khác" lần trước. */
const NGUOI = "pm-linh";

type Man = { ten: string; url: string; mo?: (p: Page) => Promise<void> };

/** Các màn mà cảnh dữ liệu thực sự làm đổi nội dung. */
const MAN_THEO_CANH: Man[] = [
  { ten: "01-tong-quan", url: "/" },
  { ten: "02-viec-cua-ban", url: "/viec" },
  { ten: "03-du-an", url: "/du-an" },
  { ten: "04-du-an-bang", url: "/p/myapp" },
  { ten: "05-du-an-kanban", url: "/p/myapp?view=kanban" },
];

/**
 * Các màn KHÔNG phụ thuộc cảnh: kho fixture GitHub chỉ có một, cảnh chỉ đổi
 * `status.json`. Chụp một lần ở cảnh bình thường thay vì nhân năm lần cùng một
 * tấm ảnh — hai mươi tấm giống hệt nhau làm người duyệt bỏ qua cả bộ.
 */
const MAN_MOT_LAN: Man[] = [
  { ten: "06-trang-task", url: "/t/myapp/49" },
  { ten: "07-task-co-pr", url: "/t/myapp/40" },
  {
    ten: "08-modal-tao-task",
    url: "/p/myapp",
    mo: async (p) => {
      await p.getByRole("button", { name: "New task" }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
];

const CANH = [
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

async function datCanh(page: Page, canh: string) {
  await page.context().addCookies([
    { name: "bee-canh", value: canh, url: "http://127.0.0.1:3187" },
  ]);
}

async function chup(page: Page, ten: string) {
  await page.screenshot({
    path: path.join(THU_MUC!, `${ten}.jpg`),
    fullPage: true,
    type: "jpeg",
    quality: 82,
  });
}

test.describe("chụp ảnh duyệt giao diện", () => {
  test.skip(!THU_MUC, "đặt CHUP_ANH=<thư mục> để bật");
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const canh of CANH) {
    test(`cảnh ${canh}`, async ({ page }) => {
      await dangNhap(page, NGUOI);
      await datCanh(page, canh);

      for (const man of MAN_THEO_CANH) {
        await page.goto(man.url);
        await page.waitForLoadState("networkidle");
        await chup(page, `${canh}__${man.ten}`);
      }
    });
  }

  test("màn không phụ thuộc cảnh", async ({ page }) => {
    await dangNhap(page, NGUOI);
    await datCanh(page, "binh-thuong");

    for (const man of MAN_MOT_LAN) {
      await page.goto(man.url);
      await page.waitForLoadState("networkidle");
      await man.mo?.(page);
      await chup(page, `binh-thuong__${man.ten}`);
    }
  });

  test("điện thoại", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await dangNhap(page, NGUOI);
    await datCanh(page, "binh-thuong");

    for (const man of MAN_THEO_CANH) {
      await page.goto(man.url);
      await page.waitForLoadState("networkidle");
      await chup(page, `dien-thoai__${man.ten}`);
    }
  });

  test("người ngoài allowlist", async ({ page }) => {
    await dangNhap(page, "khach-la");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await chup(page, "quyen__09-nguoi-ngoai");
  });
});
