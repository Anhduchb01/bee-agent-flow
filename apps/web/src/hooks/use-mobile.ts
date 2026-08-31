import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * "Mobile" is not only a narrow window.
 *
 * An iPhone 13 Pro Max on its side is 926px wide — past the breakpoint — so
 * the app used to hand it the DESKTOP sidebar: 256px of permanent chrome,
 * a third of the screen, on a device with 428px of height to spend. The
 * second clause catches that: short AND touch-driven is a phone, whatever
 * the width says. A desk window is never `pointer: coarse`, so nothing on a
 * laptop changes.
 */
const QUERY =
  `(max-width: ${MOBILE_BREAKPOINT - 1}px), (max-height: 500px) and (pointer: coarse)`;

/**
 * Bản CLI sinh ra dùng `useState` + `setState` ngay trong `useEffect`, và
 * `react-hooks/set-state-in-effect` bắt đúng: nó render một lần với giá trị sai
 * rồi mới sửa, gây một nhịp nháy bố cục ở lần tải đầu trên điện thoại.
 *
 * `useSyncExternalStore` đọc thẳng kích thước màn hình lúc render nên không có
 * nhịp sai nào, và nó cũng cho phép truyền giá trị cho server (`false` — server
 * không có màn hình, và desktop là mặc định an toàn hơn cho bố cục).
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
