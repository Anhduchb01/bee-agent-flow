import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * A six-column table is normal in agent output and in a GitHub issue body,
 * and impossible in 390px.
 *
 * It used to get a box of its own and scroll sideways — better than squeezing
 * until nothing reads ("Statu / s"), but still a real sideways drag on a
 * screen where every other one is a bug.
 *
 * So each cell now carries its column's name in `data-label`, and CSS stacks
 * the rows into label/value pairs on a phone (see `globals.css`). One real
 * `<table>` either way: no duplicated markup, no second copy for a screen
 * reader to read out, and the desk view is exactly what it was.
 *
 * When the shape is not understood — no header row, or a row longer than the
 * header — those cells are left unlabelled rather than guessed at. A wrong
 * word in front of real data is worse than no word, and the scroll box is
 * still there to fall back on.
 *
 * `data-scroll-x` is the contract `e2e/mobile-layout.spec.ts` reads: a
 * container may scroll sideways only if it says so.
 */

/** The visible text of a node, flattened — a header cell can hold markup. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function isTag(node: ReactNode, tag: string): node is ReactElement<{ children?: ReactNode }> {
  return isValidElement(node) && node.type === tag;
}

/** Column names from the first `<tr>` inside `<thead>`, if there is one. */
function headers(children: ReactNode): string[] {
  for (const section of Children.toArray(children)) {
    if (!isTag(section, "thead")) continue;
    for (const tr of Children.toArray(section.props.children)) {
      if (!isTag(tr, "tr")) continue;
      return Children.toArray(tr.props.children)
        .filter((c) => isTag(c, "th") || isTag(c, "td"))
        .map(textOf);
    }
  }
  return [];
}

/** Clone the tree, stamping every `<td>` with the name of its column. */
function label(node: ReactNode, cols: string[]): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ children?: ReactNode }>;

  if (el.type === "tr") {
    let i = -1;
    const cells = Children.map(el.props.children, (cell) => {
      if (!isTag(cell, "td")) return cell;
      i += 1;
      const name = cols[i];
      // Past the end of the header: leave it bare rather than mislabel it.
      return name === undefined || name === ""
        ? cell
        : cloneElement(cell as ReactElement<Record<string, unknown>>, { "data-label": name });
    });
    return cloneElement(el, undefined, cells);
  }

  if (el.props.children === undefined) return el;
  return cloneElement(el, undefined, Children.map(el.props.children, (c) => label(c, cols)));
}

export function WideTable({ children, ...rest }: React.ComponentProps<"table">) {
  const cols = headers(children);
  const body = cols.length === 0 ? children : Children.map(children, (c) => label(c, cols));

  return (
    <div data-scroll-x className="overflow-x-auto">
      <table data-stacked className="w-max min-w-full" {...rest}>
        {body}
      </table>
    </div>
  );
}
