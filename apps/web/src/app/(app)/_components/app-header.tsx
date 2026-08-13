import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Việc của bạn" },
  { href: "/du-an", label: "Dự án" },
] as const;

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
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-5 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-title text-foreground"
        >
          bee
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-control px-2 py-1 text-body transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-body" title={login}>
            <span className="hidden sm:inline">{displayName}</span>
            <span className="eyebrow rounded-pill border border-border px-1.5 py-0.5">
              {role === "pm" ? "PM" : "TL"}
            </span>
          </span>
          <form action={raNgoai}>
            <Button type="submit" variant="outline" size="sm">
              Thoát
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
