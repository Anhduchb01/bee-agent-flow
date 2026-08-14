import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` để cài lên máy được.
   *
   * Không có nó thì chạy production cần cả `node_modules` (hàng trăm MB, và một
   * cây phụ thuộc đầy đủ nằm dưới quyền của user chạy web). Bản standalone gói
   * đúng những gì runtime cần vào `.next/standalone`, nên `/opt/bee-web` chỉ
   * chứa mã chạy — ít bề mặt hơn, và không có `devDependencies` nào ở đó.
   */
  output: "standalone",

  /**
   * Trỏ về gốc monorepo để Next gom đúng phần `node_modules` của pnpm.
   * Thiếu dòng này thì bản standalone thiếu file và chỉ đổ lúc khởi động.
   */
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
};

export default nextConfig;
