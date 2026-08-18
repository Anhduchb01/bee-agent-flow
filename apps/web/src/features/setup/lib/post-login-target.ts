import type { BeeDoctor } from "@/lib/bee/types";

/**
 * Where a successful login should land. An explicit in-app `?next=`
 * destination always wins; otherwise an unverified or failing machine goes
 * straight to /setup — a fresh install should not greet you with an empty
 * Overview. `//host` is rejected: protocol-relative URLs would be an open
 * redirect despite starting with "/".
 */
export function postLoginTarget(next: string | undefined, doctor: BeeDoctor | null): string {
  if (next !== undefined && next.startsWith("/") && !next.startsWith("//")) return next;
  return doctor === null || !doctor.ok ? "/setup" : "/";
}
