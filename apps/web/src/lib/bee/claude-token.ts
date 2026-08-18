/**
 * Long-lived subscription token from `claude setup-token` (sk-ant-oat01-…).
 * API keys (sk-ant-api…) are refused: sessions run on the subscription,
 * not on pay-per-token billing.
 */
export function validateClaudeToken(token: string): boolean {
  return /^sk-ant-oat01-[A-Za-z0-9_-]+$/.test(token.trim());
}
