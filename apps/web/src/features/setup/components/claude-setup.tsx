"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BeeClaudeAuth } from "@/lib/bee/types";

import { startClaudeSetupAction, submitClaudeCodeAction } from "../api/actions";
import { CheckMark, ClaudeTokenForm } from "./machine-controls";

const STATUS_TEXT: Record<BeeClaudeAuth, string> = {
  token: "Claude signed in — setup-token token on the machine",
  interactive: "Claude signed in — interactive login on the machine",
  none: "Claude not signed in yet",
};

/**
 * Web-driven Claude login: live status first (read directly, no doctor run
 * needed), then the whole setup-token flow without touching a terminal —
 * the machine spawns it, you get the URL here, approve in the browser,
 * and paste the confirmation code back.
 */
export function ClaudeSetup({ auth }: { auth: BeeClaudeAuth }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [loi, setLoi] = useState("");
  const [xong, setXong] = useState(false);
  const [dang, start] = useTransition();

  function layLink() {
    if (dang) return;
    start(async () => {
      const ket = await startClaudeSetupAction();
      if (ket.ok) {
        setUrl(ket.url);
        setLoi("");
        setXong(false);
      } else {
        setLoi(ket.message);
      }
    });
  }

  function guiCode() {
    if (dang || code.trim() === "") return;
    start(async () => {
      const ket = await submitClaudeCodeAction(code);
      if (ket.ok) {
        setUrl("");
        setCode("");
        setLoi("");
        setXong(true);
      } else {
        setLoi(ket.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CheckMark ok={auth === "none" ? false : true} />
        <span className="text-sm text-body">{STATUS_TEXT[auth]}</span>
        <span className="flex-1" />
        {url === "" && (
          <Button
            size="sm"
            variant={auth === "none" ? "default" : "outline"}
            disabled={dang}
            onClick={layLink}
          >
            {dang ? "Starting…" : auth === "none" ? "Get login link" : "Sign in again"}
          </Button>
        )}
      </div>

      {url !== "" && (
        <div className="flex flex-col gap-2 rounded-control border border-border bg-muted/30 p-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-body underline underline-offset-2"
          >
            1 · Open claude.ai and approve ↗
          </a>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              guiCode();
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="2 · Paste the confirmation code here"
              aria-label="Confirmation code"
              autoComplete="off"
              className="flex-1 font-mono"
            />
            <Button type="submit" disabled={dang || code.trim() === ""}>
              {dang ? "Verifying…" : "Finish sign-in"}
            </Button>
          </form>
        </div>
      )}

      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      {xong && loi === "" && (
        <p className="text-xs text-emerald-500">
          Signed in — sessions will run on your subscription.
        </p>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Or paste a token from `claude setup-token` run on another machine
        </summary>
        <div className="mt-2">
          <ClaudeTokenForm done={auth === "none" ? null : true} />
        </div>
      </details>
    </div>
  );
}
