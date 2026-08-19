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
  const [loi, setLoi] = useState("");
  const [dang, batDau] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        aria-label="Refresh usage"
        disabled={dang}
        onClick={() =>
          batDau(async () => {
            const ket = await refreshUsageAction();
            setLoi(ket.ok ? "" : ket.message);
            router.refresh();
          })
        }
      >
        <RefreshCwIcon className={dang ? "animate-spin" : ""} />
      </Button>
      {loi !== "" && <span className="text-xs text-destructive">{loi}</span>}
    </span>
  );
}
