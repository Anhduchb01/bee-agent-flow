import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useChatScroll } from "./use-chat-scroll";

/** A scroll container jsdom will let us drive: heights and scrollTop are ours. */
function box(input: { height: number; view: number; top?: number }) {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: input.height, writable: true });
  Object.defineProperty(el, "clientHeight", { value: input.view, writable: true });
  el.scrollTop = input.top ?? 0;
  return el;
}

function mount(el: HTMLElement, opts: Parameters<typeof useChatScroll>[1]) {
  return renderHook(({ o }: { o: Parameters<typeof useChatScroll>[1] }) => {
    const ref = { current: el } as React.RefObject<HTMLElement | null>;
    useChatScroll(ref, o);
    return ref;
  }, { initialProps: { o: opts } });
}

describe("useChatScroll", () => {
  it("lands at the bottom on arrival — a chat opens on the newest message", () => {
    const el = box({ height: 4000, view: 600 });
    mount(el, { count: 30 });
    expect(el.scrollTop).toBe(4000 - 600);
  });

  it("follows new messages while the reader is already at the bottom", () => {
    const el = box({ height: 4000, view: 600 });
    const r = mount(el, { count: 30 });

    Object.defineProperty(el, "scrollHeight", { value: 5000, writable: true });
    r.rerender({ o: { count: 31 } });
    expect(el.scrollTop).toBe(5000 - 600);
  });

  it("does NOT yank the view when the reader has scrolled up to read", () => {
    const el = box({ height: 4000, view: 600 });
    const r = mount(el, { count: 30 });

    el.scrollTop = 500; // reading something older
    el.dispatchEvent(new Event("scroll"));
    Object.defineProperty(el, "scrollHeight", { value: 5000, writable: true });
    r.rerender({ o: { count: 31 } });

    expect(el.scrollTop).toBe(500);
  });

  it("asks for older history when the reader reaches the top", () => {
    const el = box({ height: 4000, view: 600, top: 4000 - 600 });
    const onReachTop = vi.fn();
    mount(el, { count: 30, onReachTop });

    el.scrollTop = 10;
    el.dispatchEvent(new Event("scroll"));
    expect(onReachTop).toHaveBeenCalledTimes(1);
  });

  it("does not ask again while the same page is still loading", () => {
    const el = box({ height: 4000, view: 600, top: 4000 - 600 });
    const onReachTop = vi.fn();
    mount(el, { count: 30, onReachTop, loadingOlder: true });

    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
    expect(onReachTop).not.toHaveBeenCalled();
  });

  it("holds the reader's place when older messages are prepended", () => {
    const el = box({ height: 4000, view: 600, top: 40 });
    const r = mount(el, { count: 30 });

    // A page arrived above: the content grew upward, so keeping scrollTop
    // would throw the reader back in time by the height of the new page.
    el.scrollTop = 40;
    Object.defineProperty(el, "scrollHeight", { value: 9000, writable: true });
    r.rerender({ o: { count: 30, prependedCount: 200 } });

    expect(el.scrollTop).toBe(40 + (9000 - 4000));
  });

  it("an empty conversation does not scroll anywhere", () => {
    const el = box({ height: 600, view: 600 });
    mount(el, { count: 0 });
    expect(el.scrollTop).toBe(0);
  });
});
