import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServicesPanel } from "./services-panel";

const POOL = [
  { service: "postgres", image: "postgres:16", kind: "postgres" },
  { service: "blob", image: "acme/blob:2", kind: "" },
];

describe("ServicesPanel", () => {
  it("says what each pooled service buys a session", () => {
    render(<ServicesPanel pool={[POOL[0]!]} slices={[]} />);
    expect(screen.getByText("postgres:16")).toBeInTheDocument();
    expect(screen.getByText(/database \+ role per session/)).toBeInTheDocument();
  });

  it("an image bee cannot place is called out, loudly, with the consequence", () => {
    // This is the one failure mode that guessing-from-image buys. Rendering
    // the row without the warning would be worse than not rendering it: it
    // would look like the service is shared when it is not.
    render(<ServicesPanel pool={POOL} slices={[]} />);
    expect(screen.getByText(/bee cannot place this image/)).toBeInTheDocument();
    expect(screen.getByText(/run their own copy instead of sharing/)).toBeInTheDocument();
  });

  it("no warning banner when every image is recognised", () => {
    render(<ServicesPanel pool={[POOL[0]!]} slices={[]} />);
    expect(screen.queryByText(/cannot place/)).not.toBeInTheDocument();
  });

  it("empty pool explains the trade instead of showing a blank card", () => {
    render(<ServicesPanel pool={[]} slices={[]} />);
    expect(screen.getByText(/No pool configured/)).toBeInTheDocument();
    expect(screen.getByText(/two\s+sessions want the same database at once/)).toBeInTheDocument();
  });

  it("lists slices with what they actually share", () => {
    render(
      <ServicesPanel
        pool={POOL}
        slices={[
          {
            sessionId: "de300000-0000-4000-8000-000000000001",
            slice: "bee_de300000",
            at: "2026-08-26T09:00:00Z",
            items: [
              { service: "db", image: "postgres:16", kind: "postgres", in_pool: true },
              { service: "cache", image: "redis:7", kind: "redis", in_pool: false },
            ],
          },
        ]}
      />,
    );
    // Scope to the slices list: "postgres" is also a pool SERVICE name above,
    // and asserting on the page as a whole would pass on the wrong element.
    const ds = within(screen.getByRole("list", { name: "Slices in use" }));
    expect(ds.getByText("bee_de300000")).toBeInTheDocument();
    expect(ds.getByText("postgres")).toBeInTheDocument();
    // redis is NOT shared, so the slice row must not list it as if it were.
    expect(ds.queryByText(/redis/)).not.toBeInTheDocument();
  });

  it("says when a slice shares nothing, rather than showing an empty gap", () => {
    render(
      <ServicesPanel
        pool={[]}
        slices={[{ sessionId: "de300000-0000-4000-8000-000000000001", slice: "bee_de300000", at: "t", items: [] }]}
      />,
    );
    expect(screen.getByText("nothing shared")).toBeInTheDocument();
  });
});
