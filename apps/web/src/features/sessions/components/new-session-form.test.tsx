import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NewSessionForm } from "./new-session-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../api/actions", () => ({
  batDauPhien: vi.fn(),
}));

describe("NewSessionForm", () => {
  it("no title box: the first chat message names the session, not a form field", () => {
    render(<NewSessionForm repos={[{ slug: "myapp", repo: "you/myapp" }]} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what do you want/i)).not.toBeInTheDocument();

    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
  });

  it("chat selected (no repos registered) → button says New chat", () => {
    render(<NewSessionForm repos={[]} />);
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
  });
});
