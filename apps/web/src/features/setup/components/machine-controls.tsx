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
  const [loi, setLoi] = useState("");
  const [dang, batDau] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <CheckMark ok={done} />
      <span className="text-sm text-body">Sessions survive logout (linger)</span>
      <span className="flex-1" />
      {done !== true && (
        <Button
          size="sm"
          variant="outline"
          disabled={dang}
          onClick={() =>
            batDau(async () => {
              const ket = await enableLingerAction();
              setLoi(ket.ok ? "" : ket.message);
              router.refresh();
            })
          }
        >
          {dang ? "Enabling…" : "Enable linger"}
        </Button>
      )}
      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
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
  const [loi, setLoi] = useState("");
  const [xong, setXong] = useState(false);
  const [dang, batDau] = useTransition();

  function luu() {
    if (dang) return;
    if (!validatePat(token)) {
      setLoi("Not a fine-grained PAT (github_pat_…). Classic tokens are refused on purpose.");
      return;
    }
    batDau(async () => {
      const ket = await savePatAction(token);
      if (ket.ok) {
        setToken("");
        setLoi("");
        setXong(true);
      } else {
        setLoi(ket.message);
      }
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        luu();
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
        <Button type="submit" disabled={dang || token.trim() === ""}>
          {dang ? "Saving…" : "Save PAT"}
        </Button>
      </div>
      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      {xong && loi === "" && (
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
  const [loi, setLoi] = useState("");
  const [xong, setXong] = useState(false);
  const [dang, batDau] = useTransition();

  function luu() {
    if (dang) return;
    if (!validateClaudeToken(token)) {
      setLoi("Not a setup-token token (sk-ant-oat01-…). Run `claude setup-token` and paste its output.");
      return;
    }
    batDau(async () => {
      const ket = await saveClaudeTokenAction(token);
      if (ket.ok) {
        setToken("");
        setLoi("");
        setXong(true);
      } else {
        setLoi(ket.message);
      }
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        luu();
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
        <Button type="submit" disabled={dang || token.trim() === ""}>
          {dang ? "Saving…" : "Save token"}
        </Button>
      </div>
      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      {xong && loi === "" && (
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
  const [loi, setLoi] = useState("");
  const [dang, batDau] = useTransition();

  function doi(next: boolean) {
    batDau(async () => {
      const ket = await setPausedAction(next);
      setLoi(ket.ok ? "" : ket.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {paused ? (
        <>
          <Button size="sm" disabled={dang || !ready} onClick={() => doi(false)}>
            {dang ? "Removing…" : "Remove PAUSE — go live"}
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
          <Button size="sm" variant="outline" disabled={dang} onClick={() => doi(true)}>
            {dang ? "Pausing…" : "Pause machine"}
          </Button>
        </div>
      )}
      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
    </div>
  );
}
