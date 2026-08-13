import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

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
