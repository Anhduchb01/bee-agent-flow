import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

export function AppHeader({
  displayName,
  login,
  role,
}: {
  displayName: string;
  login: string;
  role: "pm" | "tl";
}) {
  async function raNgoai() {
    "use server";
    await signOut({ redirectTo: "/dang-nhap" });
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          bee
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Hộp thư
          </Link>
          <Link
            href="/du-an"
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Dự án
          </Link>
          <Link
            href="/task-moi"
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Task mới
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground" title={login}>
            {displayName}{" "}
            <span className="text-xs uppercase">{role === "pm" ? "PM" : "TL"}</span>
          </span>
          <form action={raNgoai}>
            <Button type="submit" variant="ghost" size="sm">
              Thoát
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
