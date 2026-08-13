import { Badge } from "@/components/ui/badge";
import type { EvidenceFile, EvidenceRun } from "@/lib/bee/types";

function src(run: EvidenceRun, file: EvidenceFile): string {
  return `/api/evidence/${run.slug}/${run.number}/${run.sha}/${file.rel}`;
}

function Phat({ run, file }: { run: EvidenceRun; file: EvidenceFile }) {
  const url = src(run, file);

  // Video thật cần <video>; GIF là image/gif và thẻ đúng để phát nó là <img>.
  if (file.kind === "video") {
    return (
      <video src={url} controls playsInline preload="metadata" className="w-full rounded-md border" />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- file trên đĩa máy agent, không qua image loader
  return <img src={url} alt={file.name} className="w-full rounded-md border" loading="lazy" />;
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
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <p className="text-sm font-medium">Chưa có bằng chứng cho commit này</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {cu.length > 0
            ? `Có bằng chứng của ${cu.length} commit cũ hơn, nhưng chúng chứng minh cho một bản code không còn tồn tại.`
            : "Rule 04 sẽ dựng khi bee/test xanh và có slot bằng chứng."}
        </p>
      </div>
    );
  }

  const media = evidence.files.filter((f) => f.kind === "video" || f.kind === "image");
  const khac = evidence.files.filter((f) => f.kind !== "video" && f.kind !== "image");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          {evidence.sha}
        </Badge>
        {evidence.sha === headSha ? (
          <span className="text-xs text-muted-foreground">khớp head của PR</span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {media.map((f) => (
          <figure key={f.rel} className="flex flex-col gap-1.5">
            <Phat run={evidence} file={f} />
            <figcaption className="font-mono text-xs text-muted-foreground">{f.rel}</figcaption>
          </figure>
        ))}
      </div>

      {khac.length > 0 ? (
        <ul className="flex flex-wrap gap-3 text-xs">
          {khac.map((f) => (
            <li key={f.rel}>
              <a
                href={src(evidence, f)}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline underline-offset-4"
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
