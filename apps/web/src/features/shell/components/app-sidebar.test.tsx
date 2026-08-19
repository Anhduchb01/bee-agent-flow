import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// jsdom has no matchMedia; the sidebar's mobile hook needs a stub.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

function renderSidebar(duAn: { slug: string; dangChay: number; tone: "ok" | "agent" }[]) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          displayName="Đức"
          login="Anhduchb01"
          duAn={duAn}
          sucKhoe={{ tone: "ok", headline: "System is running", detail: null }}
          dangXuat={vi.fn()}
        />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("AppSidebar — Projects section speaks the session model", () => {
  it("lists registered repos linking to /sessions, with running badges", () => {
    renderSidebar([
      { slug: "lifebook-assessment", dangChay: 2, tone: "agent" },
      { slug: "blog", dangChay: 0, tone: "ok" },
    ]);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const repo = screen.getByRole("link", { name: /lifebook-assessment/ });
    expect(nav).toContainElement(repo);
    expect(repo).toHaveAttribute("href", "/sessions");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("the + action registers a repo — it goes to /setup, not the legacy projects page", () => {
    renderSidebar([]);
    expect(screen.getByRole("link", { name: "Register repo" })).toHaveAttribute("href", "/setup");
  });
});
