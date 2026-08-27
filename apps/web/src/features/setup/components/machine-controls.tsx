"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateClaudeToken } from "@/lib/bee/claude-token";
import { validatePat } from "@/lib/bee/pat";

import {
  enableLingerAction,
  saveClaudeTokenAction,
  savePatAction,
  setPausedAction,
} from "../api/actions";

/** ✓ / ✗ / – for a doctor check; `null` = doctor has not verified it yet. */
export function CheckMark({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <span aria-label="unverified" className="font-mono text-xs text-muted-foreground">
        –
      </span>
    );
  return ok ? (
    <span aria-label="pass" className="font-mono text-xs text-emerald-500">
      ✓
    </span>
  ) : (
    <span aria-label="fail" className="font-mono text-xs text-destructive">
      ✗
    </span>
  );
}

/** One click instead of `loginctl enable-linger` over SSH. */
export function LingerButton({ done }: { done: boolean | null }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <CheckMark ok={done} />
      <span className="text-sm text-body">Sessions survive logout (linger)</span>
      <span className="flex-1" />
      {done !== true && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const outcome = await enableLingerAction();
              setErr(outcome.ok ? "" : outcome.message);
              router.refresh();
            })
          }
        >
          {busy ? "Enabling…" : "Enable linger"}
        </Button>
      )}
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

/**
 * Paste the fine-grained PAT here instead of running `gh auth login` on the
 * machine. Client-side gate mirrors the server rule: classic tokens are
 * refused before anything is sent.
 */
export function PatForm({ done }: { done: boolean | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [finished, setFinished] = useState(false);
  const [busy, start] = useTransition();

  function stored() {
    if (busy) return;
    if (!validatePat(token)) {
      setErr("Not a fine-grained PAT (github_pat_…). Classic tokens are refused on purpose.");
      return;
    }
    start(async () => {
      const outcome = await savePatAction(token);
      if (outcome.ok) {
        setToken("");
        setErr("");
        setFinished(true);
      } else {
        setErr(outcome.message);
      }
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        stored();
      }}
    >
      <div className="flex items-center gap-2">
        <CheckMark ok={done} />
        <span className="text-sm text-body">GitHub signed in with a fine-grained PAT</span>
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
          aria-label="Fine-grained PAT"
          autoComplete="off"
          className="flex-1 font-mono"
        />
        <Button type="submit" disabled={busy || token.trim() === ""}>
          {busy ? "Saving…" : "Save PAT"}
        </Button>
      </div>
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
      {finished && err === "" && (
        <p className="text-xs text-emerald-500">Signed in — git now pushes through this PAT.</p>
      )}
    </form>
  );
}

/**
 * Claude auth without touching the machine: run `claude setup-token` on any
 * machine with a browser, approve the printed URL, paste the token here.
 * Same client-side gate as the server: only sk-ant-oat01-… is accepted.
 */
export function ClaudeTokenForm({ done }: { done: boolean | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [finished, setFinished] = useState(false);
  const [busy, start] = useTransition();

  function stored() {
    if (busy) return;
    if (!validateClaudeToken(token)) {
      setErr("Not a setup-token token (sk-ant-oat01-…). Run `claude setup-token` and paste its output.");
      return;
    }
    start(async () => {
      const outcome = await saveClaudeTokenAction(token);
      if (outcome.ok) {
        setToken("");
        setErr("");
        setFinished(true);
      } else {
        setErr(outcome.message);
      }
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        stored();
      }}
    >
      <div className="flex items-center gap-2">
        <CheckMark ok={done} />
        <span className="text-sm text-body">Claude signed in (subscription token)</span>
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="sk-ant-oat01-…"
          aria-label="Claude setup-token"
          autoComplete="off"
          className="flex-1 font-mono"
        />
        <Button type="submit" disabled={busy || token.trim() === ""}>
          {busy ? "Saving…" : "Save token"}
        </Button>
      </div>
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
      {finished && err === "" && (
        <p className="text-xs text-emerald-500">
          Token saved — sessions will run on your subscription.
        </p>
      )}
    </form>
  );
}

/**
 * The PAUSE toggle. Going live is gated on a green doctor — the button
 * explains itself instead of being mysteriously disabled.
 */
export function PauseToggle({ paused, ready }: { paused: boolean; ready: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  function swap(next: boolean) {
    start(async () => {
      const outcome = await setPausedAction(next);
      setErr(outcome.ok ? "" : outcome.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {paused ? (
        <>
          <Button size="sm" disabled={busy || !ready} onClick={() => swap(false)}>
            {busy ? "Removing…" : "Remove PAUSE — go live"}
          </Button>
          {!ready && (
            <p className="text-xs text-muted-foreground">
              Disabled until every doctor check is green — fix the red ones above first.
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-500">Machine is live.</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => swap(true)}>
            {busy ? "Pausing…" : "Pause machine"}
          </Button>
        </div>
      )}
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
