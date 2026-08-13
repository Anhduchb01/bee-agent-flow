import { expect, test } from "@playwright/test";

import { dangNhap } from "./helpers";

test("PM thấy việc đang chặn mình, xếp chờ lâu nhất lên đầu", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  const list = page.getByRole("list", { name: "Việc đang chờ bạn" });
  await expect(list).toBeVisible();

  const rows = list.getByRole("listitem");
  await expect(rows.first()).toContainText("blog#9");
  await expect(rows.first()).toContainText("Cần người");

  // Cả bốn loại chặn PM đều có mặt.
  await expect(list).toContainText("Duyệt spec");
  await expect(list).toContainText("Cho phép nhận task");
  await expect(list).toContainText("Duyệt PR");
});

test("TL thấy danh sách khác PM", async ({ page }) => {
  await dangNhap(page, "tl-duc");

  const list = page.getByRole("list", { name: "Việc đang chờ bạn" });
  await expect(list).toContainText("Agent hỏi ngược");
  // Duyệt spec là việc của PM.
  await expect(list).not.toContainText("Duyệt spec");
});

test("dải sức khoẻ hiện slot và hàng đợi", async ({ page }) => {
  await dangNhap(page, "pm-linh");

  const health = page.getByRole("region", { name: "Sức khoẻ hệ thống" });
  await expect(health).toContainText("Hệ thống đang chạy");
  await expect(health).toContainText("Slot build");
  await expect(health).toContainText("1/3");
});
