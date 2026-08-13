import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageTitle } from "./page-title";

describe("PageTitle", () => {
  it("hiện tiêu đề ở đúng vai trò heading", () => {
    render(<PageTitle title="bee" />);
    // Truy theo role như người dùng và trình đọc màn hình tìm, không theo class.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("bee");
  });

  it("bỏ hẳn dòng phụ khi không có, thay vì hiện một dòng rỗng", () => {
    const { rerender } = render(<PageTitle title="bee" />);
    expect(screen.queryByText(/đang chờ bạn/)).not.toBeInTheDocument();
    rerender(<PageTitle title="bee" hint="đang chờ bạn" />);
    expect(screen.getByText("đang chờ bạn")).toBeInTheDocument();
  });
});
