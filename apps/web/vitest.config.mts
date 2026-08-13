import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // e2e/ thuộc về Playwright. Không để Vitest nhặt nhầm rồi báo lỗi khó hiểu.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` ném lỗi ngay khi được import ngoài môi trường server của
      // Next. Đó đúng là việc của nó — nhưng nó biến mọi bài test cho lib/bee
      // thành lỗi resolve khó hiểu. Chặn thật vẫn nằm ở `pnpm build`.
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
