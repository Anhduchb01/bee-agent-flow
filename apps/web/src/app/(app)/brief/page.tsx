import { BriefView, loadBanTin } from "@/features/brief";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

/**
 * Bản tin buổi sáng (FR-5.3) — "chạy gì, xong gì, kẹt gì, và vì sao".
 * Tính từ 18:00 hôm trước, vì việc được xếp lúc tối muộn và đọc lúc sáng.
 */
export default async function BriefPage() {
  const actor = await getActor();
  if (!actor) return null;

  const banTin = await loadBanTin();

  return (
    <>
      <PageHeader
        title="Đêm qua"
        meta={
          <span className="font-mono text-xs text-muted-foreground">
            {banTin.daChay.length} phiên · {banTin.choDuyet.length} chờ duyệt · {banTin.ket.length} kẹt
          </span>
        }
      />
      <div className="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <BriefView banTin={banTin} />
      </div>
    </>
  );
}
