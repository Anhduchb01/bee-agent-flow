import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WideTable } from "./markdown-table";

/**
 * A six-column table is normal in agent output and impossible at 390px. It
 * used to get a box of its own and scroll sideways — a real drag on a thumb,
 * on a screen where every other sideways scroll is a bug.
 *
 * Now each cell carries its column's name, so CSS can stack the rows into
 * label/value pairs on a phone while the DOM stays one real <table>: same
 * semantics for a screen reader, no duplicated markup, and the desk view
 * untouched.
 */
function table() {
  return (
    <WideTable>
      <thead>
        <tr>
          <th>File</th>
          <th>Status</th>
          <th>Lines</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>parse.ts</td>
          <td>changed</td>
          <td>+12</td>
        </tr>
        <tr>
          <td>tail.ts</td>
          <td>new</td>
          <td>+40</td>
        </tr>
      </tbody>
    </WideTable>
  );
}

describe("WideTable", () => {
  it("labels every cell with its column, so a stacked row still reads", () => {
    render(table());

    expect(screen.getByText("parse.ts")).toHaveAttribute("data-label", "File");
    expect(screen.getByText("changed")).toHaveAttribute("data-label", "Status");
    expect(screen.getByText("+40")).toHaveAttribute("data-label", "Lines");
  });

  it("stays ONE table — no phone copy of the same rows", () => {
    const { container } = render(table());

    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(screen.getAllByText("parse.ts")).toHaveLength(1);
  });

  it("keeps the header cells as headers", () => {
    render(table());
    expect(screen.getByText("File").tagName).toBe("TH");
  });

  it("a table with no header is left alone rather than mislabelled", () => {
    const { container } = render(
      <WideTable>
        <tbody>
          <tr>
            <td>lonely</td>
          </tr>
        </tbody>
      </WideTable>,
    );

    // Guessing a label here would put a wrong word in front of real data.
    expect(screen.getByText("lonely")).not.toHaveAttribute("data-label");
    expect(container.querySelector("[data-scroll-x]")).not.toBeNull();
  });

  it("a row longer than the header gets labels only where it has them", () => {
    render(
      <WideTable>
        <thead>
          <tr>
            <th>One</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>a</td>
            <td>b</td>
          </tr>
        </tbody>
      </WideTable>,
    );

    expect(screen.getByText("a")).toHaveAttribute("data-label", "One");
    expect(screen.getByText("b")).not.toHaveAttribute("data-label");
  });

  it("still says it may scroll sideways — the desk view is unchanged", () => {
    const { container } = render(table());
    expect(container.querySelector("[data-scroll-x]")).not.toBeNull();
  });
});
