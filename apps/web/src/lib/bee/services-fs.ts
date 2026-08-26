import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ctl } from "./ctl";
import { laIdPhien } from "./session-id";

/**
 * Reading the service pool and the slices carved out of it (T15).
 *
 * The POOL is read by asking `service-slice.sh pool`, not by parsing compose
 * here. The image→kind table would otherwise exist twice, and the drift would
 * surface as the UI promising a shared slice that the runner never carved.
 *
 * The SLICES are read straight off disk — they are already JSON that bee
 * wrote, so a subprocess would buy nothing.
 */

export interface BeePoolService {
  service: string;
  image: string;
  /** Empty when bee cannot tell what it is — the UI must say so out loud. */
  kind: string;
}

export interface BeeSliceItem {
  service: string;
  image: string;
  kind: string;
  in_pool: boolean;
  pool_service?: string;
  slice?: string;
}

export interface BeeSlice {
  sessionId: string;
  slice: string;
  at: string;
  items: BeeSliceItem[];
}

function root(): string {
  return process.env.BEE_SRV ?? "/srv/bee";
}

function laFixture(): boolean {
  return process.env.BEE_SOURCE !== "disk";
}

const POOL_FIXTURE: BeePoolService[] = [
  { service: "postgres", image: "postgres:16", kind: "postgres" },
  { service: "rabbitmq", image: "rabbitmq:3-management", kind: "rabbitmq" },
  { service: "blob", image: "acme/blob:2", kind: "" },
];

/** Narrow one row of whatever the script printed. Unknown shapes are dropped. */
function docPoolRow(raw: unknown): BeePoolService | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.service !== "string" || o.service === "") return null;
  return {
    service: o.service,
    image: typeof o.image === "string" ? o.image : "",
    kind: typeof o.kind === "string" ? o.kind : "",
  };
}

export function docPool(raw: unknown): BeePoolService[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(docPoolRow).filter((r): r is BeePoolService => r !== null);
}

export async function readPool(opts?: { prefix?: string }): Promise<BeePoolService[]> {
  if (laFixture()) return POOL_FIXTURE;
  const prefix = opts?.prefix ?? process.env.BEE_PREFIX ?? "/opt/bee";
  try {
    const { stdout } = await ctl(path.join(prefix, "bin", "service-slice.sh"), ["pool"]);
    return docPool(JSON.parse(stdout));
  } catch {
    // No runner installed, or the door is shut: an empty pool is the honest
    // answer, and doctor is the thing that says whether that is a problem.
    return [];
  }
}

function docSliceItem(raw: unknown): BeeSliceItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.service !== "string" || o.service === "") return null;
  return {
    service: o.service,
    image: typeof o.image === "string" ? o.image : "",
    kind: typeof o.kind === "string" ? o.kind : "",
    in_pool: o.in_pool === true,
    ...(typeof o.pool_service === "string" ? { pool_service: o.pool_service } : {}),
    ...(typeof o.slice === "string" ? { slice: o.slice } : {}),
  };
}

/**
 * One session's slice. The password is in that file and is deliberately NOT
 * read: nothing on a web page needs it, and a value that never leaves disk
 * cannot leak through a screenshot.
 */
export async function readSessionSliceFrom(
  goc: string,
  id: string,
): Promise<BeeSlice | null> {
  if (!laIdPhien(id)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(goc, "sessions", id, "services.json"), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.slice !== "string") return null;
  const items = Array.isArray(o.items)
    ? o.items.map(docSliceItem).filter((i): i is BeeSliceItem => i !== null)
    : [];
  return {
    sessionId: id,
    slice: o.slice,
    at: typeof o.at === "string" ? o.at : "",
    items,
  };
}

export async function readSessionSlice(id: string): Promise<BeeSlice | null> {
  if (laFixture()) {
    return {
      sessionId: id,
      slice: "bee_de300000",
      at: "2026-08-26T09:00:00Z",
      items: [
        { service: "db", image: "postgres:16", kind: "postgres", in_pool: true, pool_service: "postgres", slice: "bee_de300000" },
        { service: "cache", image: "redis:7", kind: "redis", in_pool: false },
        { service: "blob", image: "acme/blob:2", kind: "", in_pool: false },
      ],
    };
  }
  return readSessionSliceFrom(root(), id);
}

/** Every slice currently held, newest first. */
export async function readSlicesFrom(goc: string): Promise<BeeSlice[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(path.join(goc, "sessions"));
  } catch {
    return [];
  }
  const ra: BeeSlice[] = [];
  for (const id of ids) {
    const lat = await readSessionSliceFrom(goc, id);
    if (lat !== null) ra.push(lat);
  }
  return ra.sort((a, b) => b.at.localeCompare(a.at));
}

export async function readSlices(): Promise<BeeSlice[]> {
  if (laFixture()) {
    const one = await readSessionSlice("de300000-0000-4000-8000-000000000001");
    return one === null ? [] : [one];
  }
  return readSlicesFrom(root());
}
