import "@testing-library/jest-dom/vitest";

/**
 * Đóng cửa lệnh ngoài cho CẢ bộ test (V3.T18).
 *
 * Bằng chứng vì sao: journal của máy bee ngày 25/08 có ba
 * `bee-session@cc000000-…0001.service` **failed** — uuid lấy thẳng từ fixture
 * của `session-brake.test.ts`. Bài test đó đặt BEE_SOURCE=disk để đi nhánh
 * đĩa, và nhánh đĩa thì `systemctl --user start` thật; chú thích trong test
 * *giả định* "sandbox không có systemctl", sai đúng trên cái máy mà test
 * quan trọng nhất — nơi `bee-session@.service` là unit static.
 *
 * Nên mặc định là đóng: `lib/bee/ctl.ts` từ chối mọi lệnh khi BEE_CTL=none.
 * Bài nào cần chạy lệnh thật phải tự mở, chứ không phải hy vọng máy thiếu
 * binary.
 */
process.env.BEE_CTL = "none";
