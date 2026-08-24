import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectView } from "../api/load";

import { ProjectCard } from "./project-card";

const DU_AN = {
  slug: "lifebook-assessment",
  full: "Anhduchb01/lifebook-assessment",
  repo: { paused: false },
  running: [],
  tasks: [],
  prs: [],
} as unknown as ProjectView;

describe("ProjectCard — the whole card is the tap target", () => {
  it("stretches its one link over the card so a thumb cannot miss it", () => {
    render(
      <ul>
        <ProjectCard project={DU_AN} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: "lifebook-assessment" });
    expect(link).toHaveAttribute("href", "/p/lifebook-assessment");
    // The stretch pair: inset-0 overlay on the link, positioning on the card.
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(link.closest("[data-slot='card']")).toHaveClass("relative");
  });

  it("stays a single link — a stretched card must not hide extra controls", () => {
    render(
      <ul>
        <ProjectCard project={DU_AN} />
      </ul>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
