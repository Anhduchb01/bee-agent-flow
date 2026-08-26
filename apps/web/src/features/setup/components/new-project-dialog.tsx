"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { registerRepoAction } from "../api/actions";
import { EnvEditor } from "./env-editor";

/**
 * Register a repo without leaving the screen you are on.
 *
 * Both entry points (the board's "New project" and the sidebar's +) used to
 * be links to /setup, which meant: lose your place, hunt for the form, come
 * back. The dialog is the same two server actions /setup uses — no second
 * implementation of registering, and no second place for env files.
 *
 * Two steps in one window on purpose: a repo whose secrets are not in
 * env.d yet is a repo whose first session fails at `pnpm dev`. Offering
 * env right after registering is the moment the owner actually has them.
 */
export function NewProjectDialog({ trigger }: { trigger: React.ReactElement }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [repo, setRepo] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [loi, setLoi] = useState("");
  const [dang, start] = useTransition();

  function line() {
    setMo(false);
    // Reset only on the way out — reopening starts clean, but a failed
    // attempt keeps what was typed.
    setTimeout(() => {
      setRepo("");
      setSlug(null);
      setLoi("");
    }, 0);
    router.refresh();
  }

  function them() {
    if (dang || repo.trim() === "") return;
    start(async () => {
      const ket = await registerRepoAction(repo.trim());
      if (ket.ok && ket.slug !== undefined) {
        setSlug(ket.slug);
        setLoi("");
        router.refresh();
      } else {
        setLoi(ket.message);
      }
    });
  }

  return (
    <Dialog open={mo} onOpenChange={(v: boolean) => (v ? setMo(true) : line())}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{slug === null ? "New project" : `${slug} is registered`}</DialogTitle>
          <DialogDescription>
            {slug === null
              ? "A project is one repo the machine may work on — it must be inside your PAT's scope."
              : "Add the env files its sessions will need. They are copied into every worktree and can never be committed."}
          </DialogDescription>
        </DialogHeader>

        {slug === null ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              them();
            }}
          >
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/name"
              aria-label="org/repo"
              autoFocus
              // text-base: under 16px iOS Safari zooms the page on focus.
              className="font-mono text-base sm:text-sm"
            />
            {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
            <DialogFooter>
              <Button type="submit" disabled={dang || repo.trim() === ""}>
                {dang ? "Adding…" : "Add project"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <EnvEditor slug={slug} files={[]} moSan />
            <p className="text-xs text-muted-foreground">
              Still to do once, on GitHub: branch protection on <code>main</code> — the
              fence that makes the whole model safe. <code>doctor</code> checks it.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={line}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
