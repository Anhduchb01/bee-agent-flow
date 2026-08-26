import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { BeeRegisteredRepo } from "@/lib/bee/types";

import { CHAT_OPTION, RepoCombobox } from "./repo-combobox";

const REPOS: BeeRegisteredRepo[] = [
  { slug: "myapp", repo: "you/myapp" },
  { slug: "site", repo: "acme/site" },
];

/** Controlled harness — the combobox itself is controlled like the form uses it. */
function Harness({ initial = "myapp" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <RepoCombobox repos={REPOS} value={value} onChange={setValue} />;
}

describe("RepoCombobox", () => {
  it("closed by default: one combobox button with the current repo, no listbox", () => {
    render(<Harness />);
    const nut = screen.getByRole("combobox", { name: "Repository" });
    expect(nut).toHaveTextContent("you/myapp");
    expect(nut).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("click opens the panel: search input INSIDE it is focused, all repos + chat pinned last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search repos…")).toHaveFocus();

    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "you/myapp",
      "acme/site",
      "No repo — just chat",
    ]);
  });

  it("typing filters diacritic-insensitively; chat stays pinned last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.keyboard("mỹ");

    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["you/myapp", "No repo — just chat"]);
  });

  it("no repo matches: chat option still there, plus an empty note", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.keyboard("zzz");

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "No repo — just chat",
    ]);
    expect(screen.getByText("No matching repo")).toBeInTheDocument();
  });

  it("selects by mouse: click an option → value changes, panel closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.click(screen.getByRole("option", { name: "acme/site" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveTextContent("acme/site");
  });

  it("selects by keyboard: ArrowDown moves the active option, Enter picks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    // Active starts at the current value (you/myapp) → one ArrowDown = acme/site.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveTextContent("acme/site");
  });

  it("ArrowDown past the end lands on the pinned chat option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveTextContent(
      "No repo — just chat",
    );
  });

  it("Escape closes WITHOUT changing the selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveTextContent("you/myapp");
  });

  it("reopening clears the previous search text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const nut = screen.getByRole("combobox", { name: "Repository" });
    await user.click(nut);
    await user.keyboard("mỹ{Escape}");
    await user.click(nut);

    expect(screen.getByPlaceholderText("Search repos…")).toHaveValue("");
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("with no registered repos, chat is the only option", async () => {
    const user = userEvent.setup();
    function Empty() {
      const [value, setValue] = useState(CHAT_OPTION);
      return <RepoCombobox repos={[]} value={value} onChange={setValue} />;
    }
    render(<Empty />);
    const nut = screen.getByRole("combobox", { name: "Repository" });
    expect(nut).toHaveTextContent("No repo — just chat");
    await user.click(nut);
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
