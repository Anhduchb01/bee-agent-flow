"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { refreshUsageAction } from "../api/actions";

/**
 * There is no `claude usage` CLI — refresh re-harvests what the sessions
 * already wrote (rate_limit_event + usage.json) into the state files the
 * panel reads. One click, fresh truth.
 */
export function RefreshUsageButton() {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        aria-label="Refresh usage"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const ket = await refreshUsageAction();
            setErr(ket.ok ? "" : ket.message);
            router.refresh();
          })
        }
      >
        <RefreshCwIcon className={busy ? "animate-spin" : ""} />
      </Button>
      {err !== "" && <span className="text-xs text-destructive">{err}</span>}
    </span>
  );
}
