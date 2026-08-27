import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postLoginTarget } from "@/features/setup";
import { auth, signIn, signOut } from "@/lib/auth";
import { getBee } from "@/lib/bee";

const isLive = process.env.GITHUB_SOURCE === "live";

/**
 * Cấu hình live còn thiếu gì.
 *
 * `GITHUB_SOURCE=live` mà chưa có OAuth app thì nút "Continue with GitHub" dẫn
 * thẳng tới trang 404 của GitHub, vì URL authorize mang `client_id=` rỗng. Trang
 * đó không nhắc gì tới bee và không nhắc gì tới cấu hình.
 *
 * `ALLOWED_LOGINS` rỗng thì đăng nhập THÀNH CÔNG rồi vào một app trống trơn —
 * cố ý (rỗng nghĩa là không ai, không phải ai cũng được), nhưng nó là thứ đọc ra
 * y hệt "app hỏng". Nói trước còn hơn để người ta đi dò.
 */
function thieuGi(): string[] {
  if (!isLive) return [];
  const thieu: string[] = [];
  if (!process.env.AUTH_GITHUB_ID) thieu.push("AUTH_GITHUB_ID");
  if (!process.env.AUTH_GITHUB_SECRET) thieu.push("AUTH_GITHUB_SECRET");
  if (!process.env.AUTH_SECRET) thieu.push("AUTH_SECRET");
  if (!process.env.ALLOWED_LOGINS?.trim()) thieu.push("ALLOWED_LOGINS");
  return thieu;
}

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const thieu = thieuGi();
  const { next, expired: expired } = await searchParams;
  // Fresh or failing machine → login drops you on /setup, not an empty
  // Overview. An explicit ?next= destination still wins.
  const target = postLoginTarget(
    typeof next === "string" ? next : undefined,
    await getBee().readDoctor(),
  );

  // `expired` nghĩa là GitHub đã từ chối token của phiên này. Phiên vẫn giải mã
  // được, nên KHÔNG được chuyển hướng vào trong: cookie hỏng còn nguyên đó và
  // trang trong lại ném ngược ra đây, lặp mãi. Chỉ có đăng xuất mới xoá được nó.
  if (session?.login && !expired) redirect(target);

  async function signInWithGithub() {
    "use server";
    await signIn("github", { redirectTo: target });
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  async function signInAsTester(formData: FormData) {
    "use server";
    await signIn("dev", { login: String(formData.get("login") ?? ""), redirectTo: target });
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <MeshGradient />

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div className="flex flex-col gap-3">
          <h1 className="text-[2.5rem] leading-none font-semibold tracking-display text-foreground">
            <span aria-hidden>🐝</span> bee
          </h1>
          <p className="text-sm text-body">
            Where you work with the agent. Sign in with your GitHub account.
          </p>
        </div>

        {expired && session?.login ? (
          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
            <p className="eyebrow text-destructive">GitHub session expired</p>
            <p className="text-sm text-body">
              You are still signed in as <code>{session.login}</code>, but GitHub no longer
              accepts the token for that session. Sign out and back in to get a new one.
            </p>
            <form action={signOutAction}>
              <Button type="submit" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        ) : isLive && thieu.length > 0 ? (
          // Không hiện nút. Một nút dẫn tới trang 404 của GitHub tệ hơn hẳn
          // không có nút: nó nói rằng đăng nhập là chuyện khả thi.
          <div className="flex flex-col gap-3 rounded-card border border-destructive/40 bg-card p-5">
            <p className="eyebrow text-destructive">Not configured</p>
            <p className="text-sm text-body">
              This dashboard runs on live GitHub data, but{" "}
              <code>/etc/bee/web.env</code> is missing:
            </p>
            <ul className="flex flex-col gap-1">
              {thieu.map((t) => (
                <li key={t} className="text-sm">
                  <code>{t}</code>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Create a GitHub OAuth app with callback{" "}
              <code>{(process.env.AUTH_URL ?? "").replace(/\/$/, "")}/api/auth/callback/github</code>{" "}
              and the <code>repo</code> scope, fill those in, then{" "}
              <code>systemctl restart bee-web</code>.
            </p>
          </div>
        ) : isLive ? (
          <form action={signInWithGithub}>
            <Button type="submit" className="w-full">
              Continue with GitHub
            </Button>
          </form>
        ) : (
          <form
            action={signInAsTester}
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
