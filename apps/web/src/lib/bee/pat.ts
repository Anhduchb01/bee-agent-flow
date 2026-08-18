/** Fine-grained PATs only (github_pat_…) — the same prefix rule doctor enforces. */
export function validatePat(token: string): boolean {
  return /^github_pat_[A-Za-z0-9_]+$/.test(token.trim());
}
