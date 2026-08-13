import { PageTitle } from "@/components/page-title";
import { getActor } from "@/lib/auth";

export default async function HopThuPage() {
  const actor = await getActor();
  if (!actor) return null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageTitle title="Đang chờ bạn" hint={`Xin chào ${actor.name}`} />
      <p className="text-sm text-muted-foreground">Hộp thư dựng ở W5.</p>
    </main>
  );
}
