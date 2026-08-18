"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BeeDoctor } from "@/lib/bee/types";

import { runDoctorAction } from "../api/actions";

/**
 * Live view of the machine's self-check (doctor.json). Three shapes:
 * never ran (fresh machine → point at the install step), failing checks
 * (each with its fix hint), all green (ready to un-PAUSE).
 */
export function DoctorChecklist({ doctor }: { doctor: BeeDoctor | null }) {
  const router = useRouter();
  const [loi, setLoi] = useState("");
  const [dangChay, batDauChay] = useTransition();

  function chayLai() {
    if (dangChay) return;
    batDauChay(async () => {
      const ket = await runDoctorAction();
      setLoi(ket.ok ? "" : ket.message);
      router.refresh();
    });
  }

  if (doctor === null) {
    return (
      <div className="rounded-card border border-border bg-card p-4">
        <p className="text-sm text-body">
          Doctor has never run on this machine — finish step 1 (install the runner), then run:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-control bg-muted/40 p-2 font-mono text-xs text-body">
          /opt/bee/bin/doctor.sh
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        {doctor.ok ? (
          <span className="font-mono text-xs text-emerald-500">
            All checks green — ready to un-PAUSE
          </span>
        ) : (
          <span className="font-mono text-xs text-destructive">
            Some checks are failing — fix them before removing PAUSE
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground">
          checked {doctor.checked_at}
        </span>
        <Button size="sm" variant="outline" onClick={chayLai} disabled={dangChay}>
          {dangChay ? "Running…" : "Run doctor again"}
        </Button>
      </div>

      {doctor.paused && (
        <p className="rounded-control border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-500">
          PAUSED — the machine takes no new sessions until you remove /srv/bee/PAUSE
        </p>
      )}

      <ul aria-label="Doctor checks" className="flex flex-col gap-1.5">
        {doctor.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 font-mono text-xs">
            {c.ok ? (
              <span aria-label="pass" className="text-emerald-500">
                ✓
              </span>
            ) : (
              <span aria-label="fail" className="text-destructive">
                ✗
              </span>
            )}
            <span className={c.ok ? "text-body" : "text-destructive"}>
              <span className="text-muted-foreground">{c.id}</span> — {c.detail}
            </span>
          </li>
        ))}
      </ul>

      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
    </div>
  );
}
