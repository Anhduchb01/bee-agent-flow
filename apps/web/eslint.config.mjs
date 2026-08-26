import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // Feature slice chỉ thực sự "private" khi có luật chặn. Không có dòng này
      // thì "feature-sliced" chỉ là tên thư mục: mọi file với tay vào ruột của
      // mọi file khác, và không thứ gì sửa hay xoá được mà không làm gãy chỗ
      // chẳng liên quan. Trong cùng một feature thì dùng đường dẫn tương đối.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message:
                "Import chéo feature phải qua barrel: @/features/<tên>. Trong cùng feature thì dùng đường dẫn tương đối.",
            },
          ],
          // Cùng lý do như trên, cho một ranh giới khác: "mọi lệnh ngoài đi
          // qua một cửa" chỉ là lời hứa cho tới khi có luật chặn. Nếu không
          // có dòng này, lần sau ai đó cần chạy `gh` sẽ import execFile thẳng
          // — và `BEE_CTL=none` lặng lẽ hết tác dụng đúng ở chỗ mới đó.
          // Ngày 25/08 đã trả giá một lần: pnpm test start unit thật trên máy
          // bee. Ngoại lệ duy nhất là chính lib/bee/ctl.ts, mở ở dưới.
          paths: [
            {
              name: "node:child_process",
              message:
                "Outside commands must go through @/lib/bee/ctl (ctl / ctlSpawn) — that door honours BEE_CTL=none.",
            },
            {
              name: "child_process",
              message: "Use @/lib/bee/ctl (ctl / ctlSpawn).",
            },
          ],
        },
      ],
      // `any` bị cấm — thứ chưa biết kiểu thì dùng `unknown` rồi thu hẹp.
      "@typescript-eslint/no-explicit-any": "error",
      // Tham số `_ten` là cách nói "chữ ký bắt buộc có, thân hàm không dùng"
      // — đúng thứ fixture đầy rẫy. Cảnh báo cho chúng làm mọi lần deploy có
      // sẵn ba dòng vàng, và cảnh báo nào cũng có sẵn thì chẳng ai đọc nữa.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // Cửa thì phải mở được từ bên trong.
    files: ["src/lib/bee/ctl.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
