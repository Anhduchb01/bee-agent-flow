import { PageTitle } from "@/components/page-title";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <PageTitle title="bee" hint="Nơi PM và Techlead làm việc với agent" />
      <p className="text-sm text-muted-foreground">
        Bộ khung. Màn hình chính sẽ là hộp thư{" "}
        <span className="font-medium text-foreground">đang chờ bạn</span> — xem{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/specs/web.md</code>.
      </p>
    </main>
  );
}
