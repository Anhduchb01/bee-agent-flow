"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BeeRegisteredRepo } from "@/lib/bee/types";

import { registerRepoAction, unregisterRepoAction } from "../api/actions";
import { EnvEditor } from "./env-editor";
import { CheckMark } from "./machine-controls";

/**
 * Register repos from the web instead of `echo REPO=… > repos.d/…`.
 * Branch protection stays a GitHub-side step ON PURPOSE: the machine PAT
 * has no admin permission (A+ keeps it narrow), so this list links each
 * repo straight to its settings page and doctor verifies the result.
 */
export function RepoRegistry({
  repos,
  protection,
  envFiles = {},
}: {
  repos: BeeRegisteredRepo[];
  /** `repo:<slug>` doctor result per slug; undefined = doctor has not seen it. */
  protection: Record<string, boolean | undefined>;
  /** env.d store per slug — edited inline, overlaid onto every worktree. */
  envFiles?: Record<string, { path: string; content: string }[]>;
}) {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  function added() {
    if (busy || repo.trim() === "") return;
    start(async () => {
      const ket = await registerRepoAction(repo);
      if (ket.ok) {
        setRepo("");
        setErr("");
      } else {
        setErr(ket.message);
      }
      router.refresh();
    });
  }

  function go(slug: string) {
    start(async () => {
      const ket = await unregisterRepoAction(slug);
      setErr(ket.ok ? "" : ket.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          added();
        }}
      >
        <Input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/name"
          aria-label="Repository to register"
          className="flex-1 font-mono"
        />
        <Button type="submit" disabled={busy || repo.trim() === ""}>
          {busy ? "Adding…" : "Add repo"}
        </Button>
      </form>
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}

      {repos.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No repos registered yet.</p>
      ) : (
        <ul aria-label="Registered repos" className="flex flex-col gap-2">
          {repos.map((r) => (
            <li key={r.slug} className="flex flex-col font-mono text-xs">
              <span className="flex items-center gap-2">
                <CheckMark ok={protection[r.slug] ?? null} />
                {/* Repo name yields (truncate) so the two actions stay on-screen
                    on a phone instead of pushing past the card edge. */}
                <span className="min-w-0 flex-1 truncate text-body">
                  {r.repo} <span className="text-muted-foreground">({r.slug})</span>
                </span>
                <a
                  href={`https://github.com/${r.repo}/settings/branches`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground underline-offset-2 hover:underline"
                >
                  Protect main ↗
                </a>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => go(r.slug)}>
                  Remove
                </Button>
              </span>
              <EnvEditor slug={r.slug} files={envFiles[r.slug] ?? []} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        ✓ means doctor confirmed a fence in front of that repo&apos;s default branch: real GitHub
        branch protection where available (needs repo admin, set in GitHub settings with YOUR
        account), or — on GitHub Free, where private repos cannot have protection — the local
        pre-push hook the runner installs, which refuses any push outside bee/*. Upgrade
        trigger: repo goes public or the account goes Pro → enable real protection.
      </p>
    </div>
  );
}
