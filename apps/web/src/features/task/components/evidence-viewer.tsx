import { StatusDot } from "@/components/status-dot";
import type { EvidenceFile, EvidenceRun } from "@/lib/bee/types";

function src(run: EvidenceRun, file: EvidenceFile): string {
  return `/api/evidence/${run.slug}/${run.number}/${run.sha}/${file.rel}`;
}

function Phat({ run, file }: { run: EvidenceRun; file: EvidenceFile }) {
  const url = src(run, file);

  // Video thật cần <video>; GIF là image/gif và thẻ đúng để phát nó là <img>.
  if (file.kind === "video") {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-card border border-border bg-card"
      />
    );
  }
  const anh = "w-full rounded-card border border-border bg-card";
  // eslint-disable-next-line @next/next/no-img-element -- file trên đĩa máy agent, không qua image loader
  return <img src={url} alt={file.name} loading="lazy" className={anh} />;
}

/**
 * Bằng chứng phát ngay trong trang, không tải file về.
 *
 * Nó nằm trên đĩa của chính máy đang chạy app này — không upload đi đâu, không
 * MinIO, không S3. Đó là lý do intent chọn bỏ MinIO: dashboard vốn đã ở trên
 * cùng cái máy sinh ra bằng chứng.
 */
export function EvidenceViewer({
  evidence,
  cu,
  headSha,
}: {
  evidence: EvidenceRun | null;
  cu: EvidenceRun[];
  headSha: string | null;
}) {
  if (!evidence) {
    return (
      <div className="rounded-card border border-dashed border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-medium tracking-title text-foreground">
          No evidence for this commit yet
        </p>
        <p className="mt-1.5 text-sm text-body">
          {cu.length > 0
            ? `There is evidence from ${cu.length} older commit(s), but it proves a version of the code that no longer exists.`
            : "Rule 04 will build it once bee/test is green and an evidence slot is free."}
        </p>
      </div>
    );
  }

  const media = evidence.files.filter((f) => f.kind === "video" || f.kind === "image");
  const khac = evidence.files.filter((f) => f.kind !== "video" && f.kind !== "image");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-control border border-border bg-muted px-1.5 py-0.5 text-xs text-body">
          {evidence.sha}
        </code>
        {evidence.sha === headSha ? (
          <span className="flex items-center gap-1.5">
            <StatusDot tone="ok" />
            <span className="eyebrow">matches the PR head</span>
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {media.map((f) => (
          <figure key={f.rel} className="flex flex-col gap-2">
            <Phat run={evidence} file={f} />
            <figcaption className="font-mono text-xs text-muted-foreground">
              {f.rel}
            </figcaption>
          </figure>
        ))}
      </div>

      {khac.length > 0 ? (
        <ul className="flex flex-wrap gap-4 text-xs">
          {khac.map((f) => (
            <li key={f.rel}>
              <a
                href={src(evidence, f)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-link underline underline-offset-4"
              >
                {f.rel}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
