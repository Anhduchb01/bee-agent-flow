import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, signIn } from "@/lib/auth";

const isLive = process.env.GITHUB_SOURCE === "live";

/**
 * Mesh gradient — **thứ trang trí duy nhất trong cả app**.
 *
 * Nó dựng từ ba cặp màu lịch sử của Vercel (develop / preview / ship) pha lại
 * ở opacity thấp. Trang đăng nhập là bề mặt duy nhất có tính chất hero: một màn
 * hình, một hành động, không có dữ liệu. Đặt gradient sau một danh sách công
 * việc là đúng thứ mà mục "Don't" của Geist cấm.
 */
function MeshGradient() {
  return (
    // Bao toàn trang chứ không phải một dải cao cố định: `overflow-hidden` trên
    // một khối cao 24rem cắt vệt sáng thành một cạnh ngang thẳng băng, và một
    // cạnh thẳng thì đọc ra là "một dải màu" chứ không phải "một vệt sáng".
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-28 left-1/2 size-[30rem] -translate-x-1/2 opacity-40 blur-[100px] dark:opacity-30"
        style={{
          background: `
            radial-gradient(32% 32% at 30% 34%, var(--gradient-develop-start) 0%, transparent 100%),
            radial-gradient(30% 30% at 66% 28%, var(--gradient-develop-end) 0%, transparent 100%),
            radial-gradient(34% 34% at 72% 64%, var(--gradient-preview-start) 0%, transparent 100%),
            radial-gradient(28% 28% at 38% 68%, var(--gradient-preview-end) 0%, transparent 100%),
            radial-gradient(24% 24% at 22% 60%, var(--gradient-ship-end) 0%, transparent 100%)
          `,
        }}
      />
    </div>
  );
}

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
    <div className="relative flex min-h-full flex-1 flex-col">
      <MeshGradient />

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div className="flex flex-col gap-3">
          <h1 className="text-[2.5rem] leading-none font-semibold tracking-display text-foreground">
            bee
          </h1>
          <p className="text-sm text-body">
            Where PM and Techlead work with the agent. Sign in with your GitHub account.
          </p>
        </div>

        {isLive ? (
          <form action={vaoBangGithub}>
            <Button type="submit" className="w-full">
              Continue with GitHub
            </Button>
          </form>
        ) : (
          <form
            action={vaoBangTenThu}
            className="flex flex-col gap-3 rounded-card border border-border bg-card p-5"
          >
            <Label htmlFor="login" className="eyebrow">
              GitHub login
            </Label>
            <Input id="login" name="login" defaultValue="pm-linh" autoComplete="off" required />
            <Button type="submit">Sign in</Button>
            <p className="text-xs text-muted-foreground">
              Running on sample data. <code>pm-linh</code> and <code>tl-duc</code> are allowed;
              type any other name to see what someone off the allowlist sees.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
