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
  const so = Number(number);
  const repo = (await getBee().listRepos()).find((r) => r.slug === slug);
  if (!repo || !Number.isInteger(so) || so <= 0) notFound();

  const url = `https://github.com/${repo.repo}/pull/${so}`;
  return (
    <div className="flex h-dvh flex-col">
      <PageHeader
        title={`PR #${so}`}
        meta={<span className="font-mono text-xs text-muted-foreground">{repo.repo}</span>}
      />
      <ArtifactPanel repo={repo.repo} kind="pr" number={so} url={url} />
    </div>
  );
}
