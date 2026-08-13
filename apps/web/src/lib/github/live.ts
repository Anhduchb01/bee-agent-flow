import "server-only";

import type { GithubSource } from "./types";

/**
 * Bản gọi GitHub thật, bằng token của **người đang đăng nhập**.
 *
 * Chưa cài đặt — đây là pha B1/B2 trong [`tasks/plan.md`], và nó chỉ nghiệm thu
 * được khi có một máy đã cài reconciler với repo thật. Hai thứ phải làm ở đây:
 * ánh xạ response thật sang `types.ts`, và giữ nguyên nguyên tắc mọi ghi mang
 * tên người bấm — không có token bot dùng chung.
 *
 * Ném lỗi rõ ràng thay vì trả dữ liệu rỗng: một app im lặng hiện hộp thư trống
 * vì cấu hình sai trông y hệt một hộp thư trống vì không có việc, mà hai chuyện
 * đó cách nhau rất xa.
 */
export function createLiveGithubSource(): GithubSource {
  const notYet = (): never => {
    throw new Error(
      "GITHUB_SOURCE=live chưa cài đặt (pha B). Đặt GITHUB_SOURCE=fixture để chạy trên dữ liệu mẫu.",
    );
  };

  return {
    listRepos: notYet,
    listTasks: notYet,
    getTask: notYet,
    listTimeline: notYet,
    createTask: notYet,
    addComment: notYet,
    addLabel: notYet,
    removeLabel: notYet,
    approve: notYet,
  };
}
