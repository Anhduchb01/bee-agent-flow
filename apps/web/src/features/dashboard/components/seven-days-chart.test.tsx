import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bayNgayQua } from "../lib/seven-days";
import { SevenDaysChart } from "./seven-days-chart";

describe("SevenDaysChart", () => {
  it("bảy ngày không có lần chạy nào thì nói ra, không vẽ trục rỗng", () => {
    /*
     * Máy vừa cài xong rơi đúng vào đây. Bảy cột cao 0 kèm trục và chú giải
     * trông y hệt một biểu đồ hỏng — người xem sẽ đi tìm lỗi hiển thị thay vì
     * đọc được điều đang thật sự đúng: chưa có gì chạy cả.
     */
    render(<SevenDaysChart days={bayNgayQua([])} tomTat={null} />);

    expect(screen.getByText("Chưa có lần chạy nào")).toBeInTheDocument();
  });
});
