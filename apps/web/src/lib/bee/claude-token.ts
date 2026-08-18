/**
 * Long-lived subscription token from `claude setup-token` (sk-ant-oat01-…).
 * API keys (sk-ant-api…) are refused: sessions run on the subscription,
 * not on pay-per-token billing.
 */
export function validateClaudeToken(token: string): boolean {
  return /^sk-ant-oat01-[A-Za-z0-9_-]+$/.test(token.trim());
}

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

/**
 * The login URL from setup-token's terminal output. Anchored to
 * claude.ai/oauth so a docs link in the same output can never be handed
 * to the user as "click here to sign in".
 */
export function extractOauthUrl(output: string): string | null {
  const sach = output.replace(ANSI_RE, "");
  return /https:\/\/claude\.ai\/oauth\/[^\s"']+/.exec(sach)?.[0] ?? null;
}

/** The token the flow prints once the pasted code is accepted. */
export function extractSetupToken(output: string): string | null {
  return /sk-ant-oat01-[A-Za-z0-9_-]+/.exec(output.replace(ANSI_RE, ""))?.[0] ?? null;
}

/**
 * The confirmation code the browser shows for pasting back. One line of
 * URL-safe-ish characters — anything else never reaches the child's stdin.
 */
export function validateSetupCode(code: string): boolean {
  return /^[A-Za-z0-9#_-]+$/.test(code.trim());
}
