"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PoolCompose } from "@/lib/bee/services-ctl";

import { savePoolComposeAction, setPoolRunningAction } from "../api/actions";

/**
 * Owning the shared pool from here instead of over SSH: what runs, and
 * whether it is running.
 *
 * The two controls are deliberately not symmetric. Starting is harmless.
 * Stopping while a session holds a slice deletes that session's database out
 * from under a running agent — so a refusal comes back with the count, and
 * overriding it is a second, separate press rather than a checkbox someone
 * ticks once and forgets.
 */
export function PoolControls({
  running,
  compose,
}: {
  /** `null` when the machine could not be asked — say so, do not guess. */
  running: boolean | null;
  compose: PoolCompose;
}) {
  const router = useRouter();
  const [text, setText] = useState(compose.text);
  const [saveErr, setSaveErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [runErr, setRunErr] = useState("");
  /** Which direction was refused, so the override says which way it goes. */
  const [refused, setRefused] = useState<boolean | null>(null);
  const [busy, start] = useTransition();

  const dirty = text !== compose.text;

  function toggle(on: boolean, force = false) {
    start(async () => {
      const outcome = await setPoolRunningAction(on, force);
      setRunErr(outcome.ok ? "" : outcome.message);
      // Both directions can be refused for a reason the owner may outrank: a
      // held slice on the way down, a port already taken on the way up.
      setRefused(!outcome.ok && !force ? on : null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">bee-services</h3>
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <StatusDot tone={running === null ? "idle" : running ? "ok" : "down"} />
          {running === null ? "cannot ask systemd" : running ? "running" : "stopped"}
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant={running ? "ghost" : "default"}
          disabled={busy}
          onClick={() => toggle(!running)}
        >
          {running ? "Stop" : "Start"}
        </Button>
      </div>

      {runErr !== "" && (
        <p className="text-xs text-destructive" role="alert">
          {runErr}
        </p>
      )}

      {refused !== null && (
        <div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggle(refused, true)}>
            {refused ? "Start anyway" : "Stop anyway"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          className="font-mono text-xs text-muted-foreground"
          htmlFor="pool-compose"
        >
          services/compose.yml
          {!compose.exists && " — not on the machine yet; saving creates it"}
        </label>
        <Textarea
          id="pool-compose"
          aria-label="Shared pool compose file"
          className="min-h-40 font-mono text-xs"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
            setSaveErr("");
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={busy || !dirty}
            onClick={() =>
              start(async () => {
                const outcome = await savePoolComposeAction(text);
                setSaveErr(outcome.ok ? "" : outcome.message);
                setSaved(outcome.ok);
                router.refresh();
              })
            }
          >
            Save
          </Button>
          {saved && (
            <span className="text-xs text-muted-foreground">
              Saved. Restart bee-services for it to take effect.
            </span>
          )}
          {saveErr !== "" && (
            <span className="text-xs text-destructive" role="alert">
              {saveErr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
