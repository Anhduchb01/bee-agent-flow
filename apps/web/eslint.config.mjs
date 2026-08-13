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
        },
      ],
      // `any` bị cấm — thứ chưa biết kiểu thì dùng `unknown` rồi thu hẹp.
      "@typescript-eslint/no-explicit-any": "error",
    },
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
