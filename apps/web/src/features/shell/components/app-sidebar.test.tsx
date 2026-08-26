import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { AppSidebar, SidebarNewProjectTrigger } from "./app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}));
/*
 * The + is setup's dialog, composed by the server layout and handed down as
 * a node. This test stands in for that layout with a plain button: what the
 * sidebar owes is "render what you were given, in the right slot". The
 * dialog's own behaviour is new-project-dialog.test, and the two halves
 * meeting for real is e2e/du-an.spec — jsdom cannot import setup's barrel
 * anyway (it carries server-only loaders).
 */

// jsdom has no matchMedia; the sidebar's mobile hook needs a stub. `dienThoai`
// flips it so the same component can be rendered at phone width.
let dienThoai = false;
window.matchMedia = ((query: string) => ({
  matches: dienThoai && query.includes("max-width"),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

function renderSidebar(duAn: { slug: string; running: number; tone: "ok" | "agent" }[]) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        {/* The real trigger lives in PageHeader; on a phone the sheet cannot
            be opened without it, so the test needs one too. */}
        <SidebarTrigger />
        <AppSidebar
          nutTaoDuAn={<SidebarNewProjectTrigger />}
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
  it("lists registered repos linking to the board FILTERED to that project", () => {
    renderSidebar([
      { slug: "lifebook-assessment", running: 2, tone: "agent" },
      { slug: "blog", running: 0, tone: "ok" },
    ]);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const repo = screen.getByRole("link", { name: /lifebook-assessment/ });
    expect(nav).toContainElement(repo);
    expect(repo).toHaveAttribute("href", "/projects?p=lifebook-assessment");
    expect(screen.getByRole("link", { name: /blog/ })).toHaveAttribute(
      "href",
      "/projects?p=blog",
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("has a Projects entry of its own — the board with no filter", () => {
    renderSidebar([]);
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
  });

  it("the + is a button in the Projects group, not a link away to /setup", () => {
    renderSidebar([]);
    const nut = screen.getByRole("button", { name: "New project" });
    // A link is what it used to be, and what cost the owner their place.
    expect(nut).not.toHaveAttribute("href");
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toContainElement(nut);
  });
});

describe("on a phone the sidebar is a sheet — it must get out of the way", () => {
  afterEach(() => {
    dienThoai = false;
  });

  async function moSheet() {
    dienThoai = true;
    const user = userEvent.setup();
    renderSidebar([{ slug: "lifebook-assessment", running: 0, tone: "ok" }]);
    await user.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    return user;
  }

  it("tapping a project closes the sheet instead of navigating behind it", async () => {
    const user = await moSheet();
    const duAn = await screen.findByRole("link", { name: /lifebook-assessment/ });

    await user.click(duAn);
    await waitFor(() => expect(duAn).not.toBeInTheDocument());
  });

  /**
   * The + carries the same close-on-tap handler as every other link here, but
   * jsdom closes the sheet on that click either way (it cannot navigate, and
   * the dialog reacts to focus leaving), so a "sheet closed" assertion would
   * pass with the handler removed — it would prove nothing. What IS provable
   * is the other half of the fix: the tap target. 20px icon + inset-3 = 44px,
   * Apple's floor; it was inset-2 (36px) and easy to miss with a thumb.
   */
  it("the + has a thumb-sized tap target, not just a 20px icon", () => {
    renderSidebar([]);
    const them = screen.getByRole("button", { name: "New project" });
    expect(them).toHaveClass("after:-inset-3");
    expect(them).not.toHaveClass("after:-inset-2");
  });

  it("on a desktop viewport the same clicks leave the sidebar in place", async () => {
    const user = userEvent.setup();
    renderSidebar([{ slug: "blog", running: 0, tone: "ok" }]);

    await user.click(screen.getByRole("link", { name: /blog/ }));
    expect(screen.getByRole("link", { name: /blog/ })).toBeInTheDocument();
  });
});
