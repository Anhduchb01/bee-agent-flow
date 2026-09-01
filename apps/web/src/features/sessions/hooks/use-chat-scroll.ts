"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The three scroll behaviours a chat needs, and why each one is not optional.
 *
 * Before this the container had no scroll handling at all: opening a session
 * put the reader at the OLDEST of the 200 replayed lines, and new replies
 * appended out of sight below.
 *
 *  - **Open at the bottom.** A chat is about what was just said.
 *  - **Follow, but only from the bottom.** Pinning unconditionally would yank
 *    the view out from under someone reading history — the single most
 *    irritating thing a live log can do.
 *  - **Hold your place when history is prepended.** Older pages grow the
 *    content UPWARD. Leaving scrollTop alone looks like being thrown back in
 *    time, so it is corrected by exactly the height that appeared above.
 */

export interface ChatScrollOptions {
  /** Number of rendered items — the signal that something was appended. */
  count: number;
  /** Total items prepended so far. A change means a history page arrived. */
  prependedCount?: number;
  /** Called when the reader reaches the top and older history may exist. */
  onReachTop?: () => void;
  /** True while a page is in flight, so the top is not asked for twice. */
  loadingOlder?: boolean;
}

/** How close to an edge still counts as being at it. */
const EDGE_PX = 80;

export function useChatScroll(
  ref: RefObject<HTMLElement | null>,
  { count, prependedCount = 0, onReachTop, loadingOlder = false }: ChatScrollOptions,
): void {
  const pinned = useRef(true);
  const lastPrepended = useRef(prependedCount);
  const lastHeight = useRef(0);
  const started = useRef(false);

  // Track where the reader is. Kept in a ref, not state: this fires on every
  // scroll frame and must not re-render the conversation.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight <= EDGE_PX;
      if (el.scrollTop <= EDGE_PX && !loadingOlder) onReachTop?.();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, onReachTop, loadingOlder]);

  // Layout, not effect: the correction has to land in the same frame as the
  // new content, or the reader sees a jump before it is fixed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prependedCount !== lastPrepended.current) {
      const grew = el.scrollHeight - lastHeight.current;
      if (grew > 0) el.scrollTop = el.scrollTop + grew;
      lastPrepended.current = prependedCount;
      lastHeight.current = el.scrollHeight;
      return;
    }

    lastHeight.current = el.scrollHeight;
    if (count === 0) return;

    // First paint with content: arrive at the newest message.
    if (!started.current) {
      started.current = true;
      pinned.current = true;
    }
    if (pinned.current) el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [ref, count, prependedCount]);
}
