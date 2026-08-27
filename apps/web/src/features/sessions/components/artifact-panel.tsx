"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { StatusDot, type Tone } from "@/components/status-dot";
import { Button } from "@/components/ui/button";

import { loadArtifactDetailAction, loadArtifactEvidenceAction } from "../api/actions";
import type { BeeArtifactDetail } from "@/lib/bee/artifact-detail";
import type { BeeEvidenceFile } from "@/lib/bee/types";

/**
 * Issue/PR detail WITHOUT leaving the app — body, labels, comments, PR
 * stats — plus one explicit "Open on GitHub" button for everything this
 * panel does not show. Content is untrusted GitHub markdown: react-markdown
 * drops raw HTML, same as the chat renderer.
 */

const STATE_TONE: Record<string, Tone> = {
  OPEN: "ok",
  MERGED: "agent",
  CLOSED: "down",
};

function GithubProse({ text }: { text: string }) {
  return (
    <div
      className="space-y-2 text-sm leading-6 text-body
        [&_a]:underline [&_a]:underline-offset-2
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]
        [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold
        [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5
        [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-3
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_img]:max-w-full"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}

const CHECKS_LABEL: Record<string, string> = {
  pass: "checks ✓",
  fail: "checks ✗",
  pending: "checks running…",
};

export function ArtifactPanel({
  repo,
  kind,
  number,
  url,
}: {
  repo: string;
  kind: "issue" | "pr";
  number: number;
  /** Fallback link — shown even while loading or when gh fails. */
  url: string;
}) {
  const [detail, setDetail] = useState<BeeArtifactDetail | null>(null);
  const [err, setErr] = useState("");
  const [evidence, setEvidence] = useState<BeeEvidenceFile[]>([]);
  const [acIssue, setAcIssue] = useState<BeeArtifactDetail | null>(null);

  // No sync reset here: the caller keys this component by repo+kind+number,
  // so switching target remounts with clean state.
  useEffect(() => {
    let song = true;
    void loadArtifactDetailAction(repo, kind, number).then((outcome) => {
      if (!song) return;
      if (outcome.ok) setDetail(outcome.detail);
      else setErr(outcome.message);
    });
    // Evidence loads in parallel — the panel must not wait for a disk scan.
    void loadArtifactEvidenceAction(repo, kind, number).then((outcome) => {
      if (song && outcome !== null) setEvidence(outcome.files.filter((f) => f.kind !== "khac"));
    });
    return () => {
      song = false;
    };
  }, [repo, kind, number]);

  // The 1-minute review needs the CONTRACT next to the result: a PR whose
  // body says "Closes #N" pulls that issue's acceptance criteria in.
  useEffect(() => {
    if (detail === null || detail.kind !== "pr") return;
    const m = /[Cc]loses #(\d+)/.exec(detail.body);
    if (m === null) return;
    let song = true;
    void loadArtifactDetailAction(repo, "issue", Number(m[1])).then((outcome) => {
      if (song && outcome.ok) setAcIssue(outcome.detail);
    });
    return () => {
      song = false;
    };
  }, [detail, repo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {detail === null && err === "" && (
          <p className="text-sm text-muted-foreground">Loading from GitHub…</p>
        )}
        {err !== "" && <p className="text-sm text-destructive">{err}</p>}

        {detail !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <StatusDot tone={STATE_TONE[detail.state] ?? "idle"} />
              <span>{detail.state.toLowerCase()}</span>
              {detail.pr?.draft && <span>· draft</span>}
              <span>· {detail.author}</span>
              {detail.pr !== null && (
                <span className="min-w-0 truncate">
                  · {detail.pr.head} → {detail.pr.base}
                </span>
              )}
            </div>

            {detail.pr !== null && (
              <p className="font-mono text-xs text-muted-foreground">
                <span className="text-green-500">+{detail.pr.additions}</span>{" "}
                <span className="text-red-400">−{detail.pr.deletions}</span> ·{" "}
                {detail.pr.changedFiles} files
                {detail.pr.checks !== null && <> · {CHECKS_LABEL[detail.pr.checks]}</>}
              </p>
            )}

            {detail.labels.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {detail.labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    {l}
                  </span>
                ))}
              </p>
            )}

            {detail.body.trim() !== "" ? (
              <GithubProse text={detail.body} />
            ) : (
              <p className="text-sm text-muted-foreground italic">No description.</p>
            )}

            {acIssue !== null && (
              <details open className="border-t border-border pt-3">
                <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
                  Acceptance criteria — issue #{acIssue.number}: {acIssue.title}
                </summary>
                <div className="mt-2">
                  <GithubProse text={acIssue.body} />
                </div>
              </details>
            )}

            {evidence.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="font-mono text-xs text-muted-foreground">
                  Evidence — from the session that produced this {kind}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {evidence.map((f) =>
                    f.kind === "video" ? (
                      <video
                        key={f.name}
                        src={f.url}
                        controls
                        preload="metadata"
                        aria-label={f.name}
                        className="w-full rounded-control border border-border"
                      />
                    ) : (
                      <a key={f.name} href={f.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- served
                            by our own authed evidence route, next/image adds nothing */}
                        <img
                          src={f.url}
                          alt={f.name}
                          loading="lazy"
                          className="w-full rounded-control border border-border"
                        />
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}

            {detail.comments.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="font-mono text-xs text-muted-foreground">
                  {detail.comments.length} comment{detail.comments.length > 1 ? "s" : ""}
                </p>
                {detail.comments.map((c, i) => (
                  <div key={i} className="rounded-card border border-border p-3">
                    <p className="mb-1.5 font-mono text-xs text-muted-foreground">
                      {c.author} · {c.createdAt}
                    </p>
                    <GithubProse text={c.body} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        <Button
          variant="outline"
          className="w-full"
          render={<a href={url} target="_blank" rel="noopener noreferrer" />}
        >
          Open on GitHub ↗
        </Button>
      </div>
    </div>
  );
}
