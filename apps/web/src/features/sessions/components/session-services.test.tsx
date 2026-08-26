import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SessionServices } from "./session-services";

const SLICE = {
  sessionId: "de300000-0000-4000-8000-000000000001",
  slice: "bee_de300000",
  at: "2026-08-26T09:00:00Z",
  items: [
    { service: "db", image: "postgres:16", kind: "postgres", in_pool: true, slice: "bee_de300000" },
    { service: "cache", image: "redis:7", kind: "redis", in_pool: false },
    { service: "blob", image: "acme/blob:2", kind: "", in_pool: false },
  ],
};

describe("SessionServices — what THIS session is wired into", () => {
  it("no slice: no button at all", () => {
    // A control that opens an empty table is noise, and most sessions have
    // no services.
    render(<SessionServices slice={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a slice with no items is the same as no slice", () => {
    render(<SessionServices slice={{ ...SLICE, items: [] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("the button counts what it will show", () => {
    render(<SessionServices slice={SLICE} />);
    expect(screen.getByRole("button", { name: /Services for this session \(3\)/ })).toBeInTheDocument();
  });

  it("draws the line the rest of the screen cannot: pool slice vs own container", async () => {
    // This is the whole reason the sheet exists. One of these disappears when
    // gc runs; the other is shared with every other session.
    const user = userEvent.setup();
    render(<SessionServices slice={SLICE} />);
    await user.click(screen.getByRole("button", { name: /Services for this session/ }));

    expect(screen.getByText(/shared pool/)).toBeInTheDocument();
    expect(screen.getByText(/this session's own container/)).toBeInTheDocument();
  });

  it("an image bee cannot place says so, and says what happens instead", async () => {
    const user = userEvent.setup();
    render(<SessionServices slice={SLICE} />);
    await user.click(screen.getByRole("button", { name: /Services for this session/ }));
    expect(screen.getByText(/cannot place this image — this session runs its own copy/)).toBeInTheDocument();
  });

  it("shows the slice name so it can be pasted into psql", async () => {
    const user = userEvent.setup();
    render(<SessionServices slice={SLICE} />);
    await user.click(screen.getByRole("button", { name: /Services for this session/ }));
    // It appears twice on purpose — once as the sheet's header line, once on
    // the pooled row — so assert on both rather than on "exactly one".
    expect(screen.getAllByText("bee_de300000").length).toBeGreaterThanOrEqual(2);
  });
});
