# Intent — App quản lý dự án cho PM & Techlead

> Kết quả của một lượt phỏng vấn (`interview-me`), đã được xác nhận.
> **Ngày chốt:** 2026-08-13 · **Trạng thái:** đã xác nhận, chưa có spec.
>
> Đây là *ý định*, không phải thiết kế. Nó tồn tại để lần sau không phải phỏng
> vấn lại, và để mọi spec/plan phía sau có chỗ đối chiếu khi phân vân.

---

## Một câu

Một web app đa dự án chạy ngay trên máy agent, vào được từ bất cứ đâu, nơi PM và
Techlead biến ý tưởng thành task, theo dõi việc, chat tiếp với agent, xem bằng
chứng và duyệt — mà không phải mở GitHub Issues.

## Ai dùng

Hai người, mỗi người gắn **một tài khoản GitHub thật**. Tài khoản đó làm ba việc
cùng lúc: nhận diện đăng nhập, ghi vết ai làm gì, và **ký chữ ký approve**. Đây
là lý do không dùng token bot chung — một PR được duyệt phải mang tên người thật
đã duyệt nó.

## Vì sao làm bây giờ

Dự án bắt đầu từ đầu, chưa có công cụ nào. Và chỗ nghẽn không phải máy mà là
**người**: agent làm xong lúc 2 giờ sáng rồi nằm chờ tới 9 giờ vì không ai biết.

## Màn hình chính

**Hộp thư "đang chờ bạn"**, xếp theo thời gian đã chờ — không phải board.

Đây là lựa chọn có chủ ý và nó định hình cả sản phẩm: máy chạy liên tục, người
nghẽn ở đúng ba cửa (duyệt spec, gắn `agent:eligible`, approve PR). Thứ đắt nhất
không phải "dự án tới đâu" mà là **"tôi đang chặn cái gì mà không biết"**. Board
và biểu đồ là màn hình thứ hai — thứ mở khi có người hỏi, không phải thứ nhìn
mỗi ngày.

## Thành công trông như thế nào

- Không ai mở GitHub Issues nữa.
- Khoảng chết "agent xong → người biết" rút xuống còn **một tin Slack**.

## Ràng buộc

- **Reconciler không sửa một dòng.** GitHub issue + label vẫn là hàng đợi của
  máy, vẫn là nguồn sự thật. App chỉ là mặt người dùng đặt lên trên.
- Stack: **Next.js 16** + Tailwind + **shadcn**, theo quy ước của Frontend Guide
  (feature slice, barrel `index.ts`, TanStack Query giữ server state, Zustand chỉ
  giữ state UI, Zod ở biên form, Vitest + MSW + Playwright).
- Vào được từ internet: **Cloudflare Access** ở rìa + **GitHub OAuth** trong app.
- 1 dự án = **1 repo**, luôn luôn.

### Ba chỗ Frontend Guide không áp thẳng được

Guide đó viết cho một sản phẩm có **backend riêng**: đăng nhập bằng Credentials
Provider gọi API, JWT + refresh token xoay vòng, type sinh từ OpenAPI của backend.
App này khác ở ba điểm, cần quyết trong spec chứ đừng chép nguyên:

| Guide | Ở đây |
|---|---|
| Credentials Provider → backend trả cặp token | **GitHub OAuth Provider.** Không có backend nào để đăng nhập vào |
| `lib/api/client.ts` refresh single-flight token của backend | Token là **của GitHub, theo từng người** — dùng để gọi GitHub API và ký approve |
| `types/api.generated.ts` sinh từ OpenAPI backend | Không có OpenAPI. Nguồn dữ liệu là `status.json` trên đĩa + GitHub API |

**Giả định để spec xác nhận:** không dựng backend tách rời. Next.js route handler
*chính là* phần server — nó chạy trên máy agent, đọc `/srv/bee/`, gọi `gh`, giữ
token OAuth phía server. Dựng thêm một service nữa chỉ để gọi lại chính cái máy
nó đang đứng trên đó là thêm bộ phận chuyển động mà không đổi lấy gì.

> Guide này thuộc về app, **không** copy vào `.claude/` của repo template — repo
> này cố ý không mang stack nào ([`c1b1467`](../../README.md)). Nó sẽ nằm trong
> `AGENTS.md` của chính thư mục app.

> Ràng buộc đầu tiên là ràng buộc quan trọng nhất. Nó giữ nguyên mọi tính chất
> đã trả giá để có: máy tắt ba tiếng không mất việc, `kill -9` giữa chừng vẫn tự
> dọn, `.agent/PAUSE` vẫn dừng được agent, và mọi thao tác đều có lịch sử.

## Hai chỗ chat — ranh giới giữa chúng là điều quan trọng nhất

| | Chat ý tưởng (cửa sổ trống) | Chat vào task |
|---|---|---|
| Để làm gì | Ý còn mù mờ → task rõ ràng | Nói tiếp với agent về task đó |
| Quyền | **Chỉ đọc repo** | Sửa code trong worktree của task |
| Dùng gì có sẵn | skill `interview-me`, `idea-refine` | rule 02, `--resume` phiên cũ |
| Kết thúc bằng | Một issue **soạn sẵn** — người bấm mới tạo | Commit đẩy vào PR của task |
| Ra PR không | Không | Có |

Chat vào task thay cho việc gõ `@claude` trên GitHub, và chạy trên rule 02 đã có.

## Duyệt

| | PM | Techlead |
|---|---|---|
| Duyệt cái gì | AC + video | Diff |
| Duyệt ở đâu | Trong app | Ở đâu cũng được |
| Xem diff ở đâu | — | GitHub (app chỉ đưa link PR) |

**Merge chỉ diễn ra trên GitHub.** App không có nút merge.

## Ngoài phạm vi — bản đầu

- **Không có phiên làm việc tự mở trên repo.** Muốn tự do sửa code với agent thì
  dùng Claude Code trên máy riêng. *(Đã cân nhắc và bỏ.)*
- **Không có trình xem diff, không comment theo dòng trên web** — làm thẳng trên
  GitHub nhanh hơn. *(Đã cân nhắc và bỏ.)*
- Không có nút merge.
- Không quản lý dự án không có repo.
- **Không upload bằng chứng đi đâu** — bỏ MinIO, đọc thẳng file trên đĩa, vì
  dashboard nằm ngay trên máy agent.
- Không dùng được khi máy agent tắt. Chấp nhận.
- "Customize giao diện" = sắp xếp/ẩn khối. Làm sau cùng.

## Hệ quả đã biết lên phần đã viết

- Bỏ MinIO nghĩa là mốc *"PR này đã có bằng chứng cho SHA hiện tại chưa"* không
  còn nằm trong PR body được nữa — phải chuyển sang state trên đĩa
  ([`rules/04-evidence.sh`](../../apps/reconciler/rules/04-evidence.sh)).
- [`public/index.html`](../../apps/reconciler/public/index.html) hiện tại trở
  thành **một màn hình bên trong** app này, không còn là sản phẩm độc lập.
