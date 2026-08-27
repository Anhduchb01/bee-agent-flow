"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { deleteEnvFileAction, saveEnvFileAction } from "../api/actions";

interface EnvFile {
  path: string;
  content: string;
}

/** One existing file: editable content, save/delete. */
function EnvFileCard({ slug, file }: { slug: string; file: EnvFile }) {
  const router = useRouter();
  const [content, setContent] = useState(file.content);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-border p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-body">{file.path}</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const outcome = await deleteEnvFileAction(slug, file.path);
              setErr(outcome.ok ? "" : outcome.message);
              router.refresh();
            })
          }
        >
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || content === file.content}
          onClick={() =>
            start(async () => {
              const outcome = await saveEnvFileAction(slug, file.path, content);
              setErr(outcome.ok ? "" : outcome.message);
              router.refresh();
            })
          }
        >
          Save
        </Button>
      </div>
      {/* text-base on phones — under 16px iOS Safari zooms in on focus. */}
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        aria-label={`Content of ${file.path}`}
        rows={3}
        className="font-mono text-base sm:text-xs"
      />
      {err !== "" && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

/**
 * Per-repo env store, edited on the web: what you save here lands in
 * env.d/<slug>/ and session-run overlays it onto every new worktree —
 * readable by the agent, git-excluded so it can never be committed.
 */
export function EnvEditor({
  slug,
  files,
  moSan = false,
}: {
  slug: string;
  files: EnvFile[];
  /**
   * Open on mount. Collapsed is right on /setup (a list of repos, env is a
   * detail); open is right in the new-project dialog, where asking for env
   * IS the step — a collapsed <details> there renders the field hidden, and
   * an invisible prompt prompts nobody.
   */
  moSan?: boolean;
}) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  function added() {
    if (busy || path.trim() === "") return;
    start(async () => {
      const outcome = await saveEnvFileAction(slug, path.trim(), content);
      if (outcome.ok) {
        setPath("");
        setContent("");
        setErr("");
      } else {
        setErr(outcome.message);
      }
      router.refresh();
    });
  }

  return (
    <details className="mt-1" open={moSan}>
      <summary className="cursor-pointer font-mono text-xs text-muted-foreground hover:text-body">
        Env files ({files.length}) — copied into every worktree, never committable
      </summary>
      <div className="mt-2 flex flex-col gap-2 pl-2">
        {files.map((f) => (
          <EnvFileCard key={f.path} slug={slug} file={f} />
        ))}
        <div className="flex flex-col gap-1.5 rounded-control border border-dashed border-border p-2.5">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder=".env or apps/web/.env.local — path inside the repo"
            aria-label={`New env file path for ${slug}`}
            className="font-mono text-base sm:text-xs"
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"API_KEY=…\nDB_URL=…"}
            aria-label={`New env file content for ${slug}`}
            rows={3}
            className="font-mono text-base sm:text-xs"
          />
          <div className="flex items-center gap-2">
            {err !== "" && <p className="text-xs text-destructive">{err}</p>}
            <span className="flex-1" />
            <Button size="sm" disabled={busy || path.trim() === ""} onClick={added}>
              {busy ? "Saving…" : "Add env file"}
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
