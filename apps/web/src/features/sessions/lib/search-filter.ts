/**
 * Diacritic-insensitive substring match for the repo combobox.
 * Repo names are ASCII, but Vietnamese keyboards often emit diacritics
 * anyway — normalize both sides so "mỹ" still finds "you/myapp".
 */
function fold(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      // Strip combining marks left over from NFD (ế → e, ự → u…).
      .replace(/\p{M}/gu, "")
      // đ/Đ are standalone letters, not base + mark — map by hand.
      .replace(/đ/g, "d")
  );
}

export function matchesQuery(text: string, query: string): boolean {
  const q = fold(query.trim());
  if (q === "") return true;
  return fold(text).includes(q);
}
