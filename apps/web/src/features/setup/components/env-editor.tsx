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
function MotFile({ slug, file }: { slug: string; file: EnvFile }) {
  const router = useRouter();
  const [content, setNoiDung] = useState(file.content);
  const [loi, setLoi] = useState("");
  const [dang, start] = useTransition();

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-border p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-body">{file.path}</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          disabled={dang}
          onClick={() =>
            start(async () => {
              const ket = await deleteEnvFileAction(slug, file.path);
              setLoi(ket.ok ? "" : ket.message);
              router.refresh();
            })
          }
        >
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={dang || content === file.content}
          onClick={() =>
            start(async () => {
              const ket = await saveEnvFileAction(slug, file.path, content);
              setLoi(ket.ok ? "" : ket.message);
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
        onChange={(e) => setNoiDung(e.target.value)}
        aria-label={`Content of ${file.path}`}
        rows={3}
        className="font-mono text-base sm:text-xs"
      />
      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
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
  const [path, setDuongDan] = useState("");
  const [content, setNoiDung] = useState("");
  const [loi, setLoi] = useState("");
  const [dang, start] = useTransition();

  function them() {
    if (dang || path.trim() === "") return;
    start(async () => {
      const ket = await saveEnvFileAction(slug, path.trim(), content);
      if (ket.ok) {
        setDuongDan("");
        setNoiDung("");
        setLoi("");
      } else {
        setLoi(ket.message);
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
          <MotFile key={f.path} slug={slug} file={f} />
        ))}
        <div className="flex flex-col gap-1.5 rounded-control border border-dashed border-border p-2.5">
          <Input
            value={path}
            onChange={(e) => setDuongDan(e.target.value)}
            placeholder=".env or apps/web/.env.local — path inside the repo"
            aria-label={`New env file path for ${slug}`}
            className="font-mono text-base sm:text-xs"
          />
          <Textarea
            value={content}
            onChange={(e) => setNoiDung(e.target.value)}
            placeholder={"API_KEY=…\nDB_URL=…"}
            aria-label={`New env file content for ${slug}`}
            rows={3}
            className="font-mono text-base sm:text-xs"
          />
          <div className="flex items-center gap-2">
            {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
            <span className="flex-1" />
            <Button size="sm" disabled={dang || path.trim() === ""} onClick={them}>
              {dang ? "Saving…" : "Add env file"}
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
