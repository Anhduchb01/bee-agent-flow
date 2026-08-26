import { notFound } from "next/navigation";

import { ArtifactPanel } from "@/features/sessions";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";
import { getBee } from "@/lib/bee";

/**
 * Full-page PR review (plan A): the URL GitHub links back to. Private
 * repos cannot render committed images inline in a PR body (camo has no
 * read access), so the PR carries a link HERE — snapshots inline, demo
 * video playable, linked issue's acceptance criteria alongside.
 */
export default async function PrReviewPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const actor = await getActor();
  if (!actor) return null;

  const { slug, number } = await params;
  const count = Number(number);
  const repo = (await getBee().listRepos()).find((r) => r.slug === slug);
  if (!repo || !Number.isInteger(count) || count <= 0) notFound();

  const url = `https://github.com/${repo.repo}/pull/${count}`;
  return (
    <div className="flex h-dvh flex-col">
      <PageHeader
        title={`PR #${count}`}
        meta={<span className="font-mono text-xs text-muted-foreground">{repo.repo}</span>}
      />
      <ArtifactPanel repo={repo.repo} kind="pr" number={count} url={url} />
    </div>
  );
}
