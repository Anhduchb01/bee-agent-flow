"use client";

import { useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusDot } from "@/components/status-dot";
import type { BeeSlice } from "@/lib/bee/services-fs";

/**
 * What THIS session is wired into (T15c4).
 *
 * The Settings screen answers "what does the machine have". Standing in front
 * of a running session the question is different — "what is this one talking
 * to" — and the two cannot answer for each other.
 *
 * The distinction the sheet exists to draw: which services are a SLICE of the
 * shared pool and which are the session's OWN containers. One of them
 * disappears when gc runs; the other is shared with every other session, so
 * breaking it breaks them too. Nothing else on screen says which is which.
 *
 * No button when there is nothing to show — a control that opens an empty
 * table is noise.
 */
export function SessionServices({ slice }: { slice: BeeSlice | null }) {
  const [open, setOpen] = useState(false);
  if (slice === null || slice.items.length === 0) return null;

  const shared = slice.items.filter((i) => i.in_pool);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Services for this session (${slice.items.length})`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-border px-2.5 font-mono text-xs text-body hover:bg-accent"
      >
        <span aria-hidden>⛁</span>
        {slice.items.length}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Services for this session</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-4">
            <p className="font-mono text-xs text-muted-foreground">
              slice <span className="text-foreground">{slice.slice}</span>
            </p>

            <ul aria-label="Session services" className="flex flex-col gap-2">
              {slice.items.map((i) => (
                <li
                  key={i.service}
                  className="flex flex-col gap-1 rounded-control border border-border p-2.5 font-mono text-xs"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusDot tone={i.in_pool ? "ok" : i.kind === "" ? "warn" : "agent"} />
                    <span className="text-foreground">{i.service}</span>
                    <span className="text-muted-foreground">{i.image}</span>
                  </span>
                  <span className="text-body">
                    {i.in_pool ? (
                      <>
                        shared pool · <span className="text-foreground">{i.slice ?? slice.slice}</span>
                      </>
                    ) : i.kind === "" ? (
                      <span className="text-warning">
                        bee cannot place this image — this session runs its own copy
                      </span>
                    ) : (
                      <>this session&apos;s own container</>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {shared.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pool slices are given back when gc reclaims this session&apos;s worktree — so
                the data survives a stop, and a merged PR keeps it for at least another day.
                The session&apos;s own containers go at the same moment.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
