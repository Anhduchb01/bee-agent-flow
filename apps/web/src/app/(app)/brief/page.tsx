import { DigestView, loadDigest } from "@/features/brief";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

/**
 * Activity (FR-5.3) — "what ran, what finished, what is stuck, and why".
 * Cửa sổ là 24 giờ trượt: Autopilot chạy cả ngày, nên trang này không được
 * có điểm mù theo giờ (xem `khoangGanDay`).
 */
export default async function BriefPage() {
  const actor = await getActor();
  if (!actor) return null;

  const digest = await loadDigest();

  return (
    <>
      <PageHeader
        title="Activity"
        meta={
          <span className="font-mono text-xs text-muted-foreground">
            last 24h · {digest.ran.length} sessions · {digest.toReview.length} to review ·{" "}
            {digest.ket.length} stuck
          </span>
        }
      />
      <div className="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <DigestView digest={digest} />
      </div>
    </>
  );
}
