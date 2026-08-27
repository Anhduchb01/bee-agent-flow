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
 * Both hosts the flow has used: claude.ai/oauth (≤2.1.16x) and
 * claude.com/cai/oauth (2.1.245, seen 25/08). Still anchored on host AND
 * path, so a docs link in the same output can never be handed to the user
 * as "click here to sign in".
 */
const OAUTH_RE = /https:\/\/claude\.(?:ai|com)\/(?:cai\/)?oauth\/[^\s"'\x07\x1b]+/;

/**
 * The login URL from setup-token's terminal output.
 *
 * The ink UI emits it twice: once inside an OSC-8 hyperlink (clean and
 * whole) and once as visible text the redraw chops into pieces. The clean
 * copy comes first, and the piece that follows is glued straight onto it
 * with no whitespace between — so a greedy "up to the next space" match
 * returns two URLs welded together, which opens nothing. Cut at the second
 * `https://`.
 */
export function extractOauthUrl(output: string): string | null {
  const cleaned = output.replace(ANSI_RE, "");
  const url = OAUTH_RE.exec(cleaned)?.[0];
  if (url === undefined) return null;
  const dragging = url.indexOf("https://", "https://".length);
  return dragging === -1 ? url : url.slice(0, dragging);
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
