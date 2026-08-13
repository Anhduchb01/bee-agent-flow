import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, signIn } from "@/lib/auth";

const isLive = process.env.GITHUB_SOURCE === "live";

export default async function DangNhapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const { "tiep-tuc": next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/";

  if (session?.login) redirect(target);

  async function vaoBangGithub() {
    "use server";
    await signIn("github", { redirectTo: target });
  }

  async function vaoBangTenThu(formData: FormData) {
    "use server";
    await signIn("dev", { login: String(formData.get("login") ?? ""), redirectTo: target });
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-8 px-6 py-24">
      <PageTitle title="bee" hint="Đăng nhập bằng tài khoản GitHub của bạn" />

      {isLive ? (
        <form action={vaoBangGithub}>
          <Button type="submit" className="w-full">
            Tiếp tục với GitHub
          </Button>
        </form>
      ) : (
        <form action={vaoBangTenThu} className="flex flex-col gap-3">
          <Label htmlFor="login">GitHub login</Label>
          <Input id="login" name="login" defaultValue="pm-linh" autoComplete="off" required />
          <Button type="submit">Đăng nhập</Button>
          <p className="text-xs text-muted-foreground">
            Bản chạy trên dữ liệu mẫu. <code>pm-linh</code> và <code>tl-duc</code> có quyền;
            gõ tên khác để xem một người ngoài allowlist nhìn thấy gì.
          </p>
        </form>
      )}
    </main>
  );
}
