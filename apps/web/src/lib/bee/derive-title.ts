/**
 * Derive a session title from the first user message — same idea as Claude
 * Code naming its sessions. Deterministic on purpose: no extra LLM turn,
 * works offline, and the title is stable across replays.
 */
const MAX_LEN = 60;

export function deriveSessionTitle(text: string): string {
  const firstLine = text.trim().split("\n", 1)[0] ?? "";
  const trimmed = firstLine.replace(/\s+/g, " ").trim();
  if (trimmed === "") return "Untitled";
  if (trimmed.length <= MAX_LEN) return trimmed;

  // Cut at the last word boundary inside the budget; fall back to a hard
  // cut when the first word alone overflows it.
  const cut = trimmed.slice(0, MAX_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
