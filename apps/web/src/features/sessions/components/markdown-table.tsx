/**
 * A six-column table is normal in agent output and in a GitHub issue body,
 * and impossible in 428px. Left alone it squeezes until nothing reads
 * ("Statu / s"); given a box of its own it keeps its natural width and
 * scrolls INSIDE that box — the one sideways drag on these screens a thumb
 * expects to find.
 *
 * `data-scroll-x` is the contract `e2e/mobile-layout.spec.ts` reads: a
 * container is allowed to scroll sideways only if it says so.
 */
export function WideTable({ children, ...rest }: React.ComponentProps<"table">) {
  return (
    <div data-scroll-x className="overflow-x-auto">
      <table className="w-max min-w-full" {...rest}>
        {children}
      </table>
    </div>
  );
}
