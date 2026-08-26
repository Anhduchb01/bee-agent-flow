export const CAC_TAB = ["install", "config"] as const;
export type SetupTab = (typeof CAC_TAB)[number];

/**
 * Which tab a bare `/setup` opens on.
 *
 * The page had been doing two jobs without saying so: a first-run wizard and
 * the place you come back to for ongoing configuration. T15c1 made the split
 * explicit, and this is the one rule that split needs — a machine that has
 * not verified yet needs the wizard; one that has is here to change
 * something. Backwards, and every visit after the first opens on install
 * instructions nobody needs.
 *
 * The tab lives in the URL so the page stays a server component and every
 * state is a link — same reason the project board keeps its filter there.
 */
export function tabMacDinh(tab: unknown, doctorOk: boolean | null): SetupTab {
  if (typeof tab === "string" && (CAC_TAB as readonly string[]).includes(tab)) {
    return tab as SetupTab;
  }
  return doctorOk === true ? "config" : "install";
}
