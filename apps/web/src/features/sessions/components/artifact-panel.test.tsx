import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ArtifactPanel } from "./artifact-panel";
import { loadArtifactDetailAction } from "../api/actions";

vi.mock("../api/actions", () => ({
  loadArtifactDetailAction: vi.fn(),
}));

const DETAIL = {
  kind: "pr" as const,
  number: 12,
  url: "https://github.com/you/myapp/pull/12",
  title: "Add export",
  state: "OPEN",
  body: "## Summary\nCSV export.",
  author: "bee-agent",
  createdAt: "2026-08-19T09:00:00Z",
  labels: ["enhancement"],
  comments: [{ author: "pm-linh", createdAt: "t", body: "Add a header row." }],
  pr: {
    draft: true,
    base: "main",
    head: "bee/myapp-41",
    additions: 120,
    deletions: 8,
    changedFiles: 6,
    checks: "pass" as const,
  },
};

describe("ArtifactPanel", () => {
  it("renders PR meta, markdown body, comments — and always the GitHub button", async () => {
    vi.mocked(loadArtifactDetailAction).mockResolvedValueOnce({ ok: true, detail: DETAIL });
    render(
      <ArtifactPanel repo="you/myapp" kind="pr" number={12} url={DETAIL.url} />,
    );

    expect(await screen.findByText("draft", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    // Markdown thật: "## Summary" thành heading, không phải chữ thô.
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Add a header row.")).toBeInTheDocument();
    expect(screen.getByText("enhancement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open on github/i })).toHaveAttribute(
      "href",
      DETAIL.url,
    );
  });

  it("gh failure shows the reason as data — the GitHub button still works", async () => {
    vi.mocked(loadArtifactDetailAction).mockResolvedValueOnce({
      ok: false,
      message: "Could not load pr #9: gh: Not Found",
    });
    render(
      <ArtifactPanel repo="you/myapp" kind="pr" number={9} url="https://github.com/you/myapp/pull/9" />,
    );

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open on github/i })).toBeInTheDocument();
  });
});
