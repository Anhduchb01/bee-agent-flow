# Đề xuất lại UI/UX

**Ngày:** 2026-08-13 · **Mockup:** [`docs/mockups/ui-de-xuat.html`](../mockups/ui-de-xuat.html)
**Nền:** [`vercel-geist.md`](vercel-geist.md) — hệ thống thị giác giữ nguyên, cái
đổi là **bố cục và phân cấp**.

---

## 1. Đã tra những gì

| Sản phẩm | Lấy được gì |
|---|---|
| **Linear** (bài viết về đợt redesign) | Nguyên tắc phân cấp thị giác, và cách họ *làm mờ* phần điều hướng |
| **Plane** (mã nguồn mở, kiểu Linear) | Sidebar có danh sách dự án, "Your work" gom mọi dự án, Power K |
| Tổng hợp mẫu dashboard 2026 (Linear · Stripe · Grafana · Vercel) | Con số cụ thể: sidebar 256px, 4–6 thẻ chỉ số, lưới 12 cột, hàng bảng 36–52px |
| Bài về dashboard UX | Luật chọn chỉ số, và danh sách chỉ số phù phiếm cần tránh |
| Bài về command palette | Cmd+K giờ là mặc định của công cụ cho dân kỹ thuật |

---

## 2. Chẩn đoán — vì sao app hiện tại "chưa đẹp, chưa dễ dùng"

Tôi đọc lại app mình vừa dựng và đối chiếu. Bốn vấn đề, xếp theo mức độ ảnh
hưởng.

### 2.1. Mọi thứ có cùng một trọng lượng thị giác ← **vấn đề lớn nhất**

Linear nói đúng điều tôi đã làm sai:

> *"Không phải mọi phần của giao diện đều nên mang trọng lượng thị giác như
> nhau. Phần trung tâm với việc người dùng đang làm thì phải nổi, còn phần phục
> vụ định hướng và điều hướng thì phải lùi lại."*

App hiện tại: header, thẻ thống kê, bảng, khối trạng thái — **tất cả đều là thẻ
trắng viền tóc 1px trên nền xám**. Không có gì lùi lại, nên mắt không biết nhìn
đâu trước. Thêm nữa tôi dùng eyebrow chữ hoa mono cho *mọi thứ*: tiêu đề khu
vực, tiêu đề cột, badge, nhãn ô thống kê. Chữ hoa mono là kiểu chữ **nặng**;
rải khắp nơi thì nó thôi không còn là nhãn nữa, nó thành nhiễu.

Linear gọi mục tiêu đúng chỗ: **"Cấu trúc phải được *cảm thấy*, không phải được
*nhìn thấy*."**

### 2.2. Menu ngang không phải là bố cục của một công cụ quản lý dự án

> *"Điều hướng ngang hợp với trang marketing 5–7 mục. Dashboard có 15–40 mục."*

Bạn nói đúng, và lý do sâu hơn một chút: menu ngang **không có chỗ cho danh sách
dự án**. Mà "nhảy giữa các dự án" chính là thao tác thường xuyên nhất của PM.
Hiện tại muốn sang dự án khác phải: Dự án → tìm thẻ → bấm. Ba bước cho một việc
làm ba mươi lần một ngày.

### 2.3. Không có chỗ nào trả lời "tình hình chung thế nào"

"Việc của bạn" là **hàng đợi cá nhân**, không phải bức tranh. Nó trả lời "tôi
phải làm gì", không trả lời "dự án đang chạy ra sao, có gì đang tắc, tuần này
máy làm được bao nhiêu". PM cần cả hai, và hiện chỉ có một.

### 2.4. Bốn con số không đổi hành vi ai cả

Luật từ bài dashboard UX, và nó cắt thẳng vào dải thống kê tôi vừa làm:

> *"Nếu một chỉ số thay đổi mà không làm bạn đổi hành vi, nó không thuộc về màn
> hình chính."*

"Task mở: 8" là chỉ số phù phiếm — biết nó là 8 hay 12 thì tôi vẫn làm y hệt.
Còn "2 việc cần người, việc lâu nhất chờ 1 ngày 2h" thì đổi hành vi ngay.

Ngoài ra chưa có **đường bàn phím** nào. Với hai người dùng đều là dân kỹ thuật,
thiếu Cmd+K là thiếu đúng thứ họ quen nhất.

---

## 3. Đề xuất

### 3.1. Vỏ ứng dụng: sidebar 256px

```
┌────────────────┬──────────────────────────────────────────────┐
│ bee      Linh ▾│  Tổng quan                        [Tạo task] │ ← header trang
├────────────────┼──────────────────────────────────────────────┤
│ ⌘K Tìm nhanh   │                                              │
│                │   (nội dung — nền trắng, nổi lên trên)       │
│ ▸ Tổng quan    │                                              │
│ ▸ Việc của bạn⁸│                                              │
│                │                                              │
│ DỰ ÁN        + │                                              │
│  ● myapp     3 │                                              │
│  ● shop      1 │                                              │
│  ○ blog        │                                              │
│                │                                              │
├────────────────┤                                              │
│ ● Đang chạy    │                                              │
│   build 1/3    │                                              │
└────────────────┴──────────────────────────────────────────────┘
   nền xám, lùi lại        nền trắng, nổi lên
```

Quyết định và lý do:

| | Chọn | Vì sao |
|---|---|---|
| Bề rộng | **256px**, thu còn 64px | Con số chuẩn của Linear/Vercel/Stripe; đủ cho nhãn không bị cắt |
| Chiều cao mục | **32px** | Chặt hơn mức 36px của web thường — đây là công cụ dùng cả ngày |
| Nền | **xám `#fafafa`**, nội dung **trắng** | Đảo ngược hiện tại. Đây là cách phần điều hướng *lùi lại* |
| Danh sách dự án | **ngay trong sidebar**, kèm chấm trạng thái và số việc đang chạy | Đổi dự án còn **một** cú bấm |
| Sức khoẻ máy | **chân sidebar**, một dòng | Luôn thấy, không chiếm chỗ của nội dung |
| Header trang | tiêu đề + điều khiển xem + **một** nút hành động chính | Mỗi màn đúng một hành động chính |

### 3.2. Màn Tổng quan — trạng thái hệ thống, không phải hàng đợi cá nhân

**Ba khối, không hơn.** Bản trước có năm khối và đọc rối; hai khối bị bỏ là hai
khối *lặp lại* màn "Việc của bạn":

| Bỏ | Vì sao |
|---|---|
| "Cần bạn ngay" (4 ô đếm) | Con số đó đã nằm ở badge cạnh "Việc của bạn" trong sidebar |
| "Chặn lâu nhất" (5 dòng) | Chính là năm dòng đầu của màn "Việc của bạn" |

Sau khi bỏ, hai màn có ranh giới sạch: **Tổng quan trả lời "hệ thống ra sao",
Việc của bạn trả lời "tôi phải làm gì".** Trước đó cả hai cùng trả lời câu thứ
hai, và đó là một nửa lý do dashboard trông rối.

**a. Claude — cạnh Máy đang làm.** Hai khối này cùng trả lời một câu: *máy có
làm được việc không*. Đặt cạnh nhau đọc một lượt.

- Hạn mức 5 giờ · Hạn mức tuần — trạng thái và đồng hồ đếm tới cửa sổ mới
- Token hôm nay, kèm tỉ lệ đọc từ cache
- Chi phí hôm nay và bảy ngày
- Băng cảnh báo khi có lần chạy dừng vì hết hạn mức

**b. Dự án** — mỗi dự án một **thanh chia theo giai đoạn**. Nhìn ngang là thấy dự
án nào đang dồn ở đâu: `blog` chỉ có 2 task nhưng một nửa kẹt ở "cần người", còn
`myapp` có 8 task mà phần lớn đang chạy. **Một cột "tổng số task" không phân biệt
được hai tình huống đó** — đó chính là lý do con số đó là chỉ số phù phiếm còn
thanh này thì không.

Sáu màu rút từ đúng bảng Vercel: `#d4d4d4` · `#8ec5ff` · `#f5a623` · `#7928ca` ·
`#0070f3` · `#ee0000`.

**c. Bảy ngày qua** — cột xanh/đỏ mỗi ngày, cao **8px cho mỗi lần chạy** nên nhìn
cột là đọc được số. Dựng từ `recent.jsonl` đã có sẵn. Đây là chỉ số xu hướng duy
nhất được đề xuất: nó trả lời "máy có đang tệ đi không".

**Cố ý KHÔNG đưa lên** (chỉ số phù phiếm, theo đúng danh sách trong tài liệu đã
tra): tổng số task · số commit · số dòng code · số giờ · tổng task đã xong.

#### Tách khu vực

Nguyên nhân "khó nhìn" không chỉ là số lượng khối. Mọi tiêu đề khu vực trước đây
đều là eyebrow mono hoa 12px xám — **cùng cỡ, cùng màu, cùng kiểu với nhãn cột và
nhãn ô**, nên không có gì tách khu vực này với khu vực kia. Tiêu đề khu vực giờ
là chữ sans 16px đậm màu mực, kèm một đường tóc chạy hết bề ngang. Nhìn lướt là
đếm được có mấy khối.

Đây cũng chính là lỗi eyebrow-dùng-khắp-nơi đã nêu ở §2.1, lần này lộ ra ở một
chỗ khác.

### 3.3. Sửa phân cấp thị giác

| Chỗ | Hiện tại | Đề xuất |
|---|---|---|
| Eyebrow mono hoa | Dùng ở ~6 loại chỗ | **Chỉ tiêu đề khu vực.** Tiêu đề cột và badge chuyển sang chữ thường 12px xám |
| Viền | Mọi khối đều viền 1px | Bảng và thẻ giữ viền; **khối trong trang bỏ viền**, tách bằng khoảng trắng |
| Hàng bảng | ~56px | **40px** (chặt) / 48px (thoáng), có nút đổi |
| Tiêu đề bảng | Trôi khi cuộn | **Dính** (`sticky`) |
| Số | 24px mono ở mọi ô | 28px cho ô chính, 18px cho ô phụ |
| Nền | Nội dung xám, thẻ trắng | **Nội dung trắng, chrome xám** |

### 3.4. Đường bàn phím

- **⌘K** — nhảy tới dự án/task, chạy hành động (Duyệt, Giao cho agent, Tạo task)
- **C** — tạo task (giống Plane)
- **/** — nhảy vào ô tìm của bảng
- **J / K** — lên xuống trong bảng, **Enter** mở

Ô tìm ở đầu sidebar hiện sẵn gợi ý `⌘K` — vấn đề lớn nhất của command palette
là *không ai biết nó tồn tại*.

---

## 3.5. Dữ liệu cho khối Claude — đã kiểm, không phải phỏng đoán

Tôi chạy thật `claude -p --output-format stream-json` trên máy này (bản 2.1.161)
và đọc dòng `result` để xem có gì, thay vì tin trí nhớ.

**Phát hiện đáng nói: reconciler đã nhận đủ dữ liệu usage rồi, và đang vứt đi.**

`bin/agent-exec.sh` gọi `claude -p --output-format stream-json --verbose`, và
`run_agent()` trong `bin/worker.sh` đã bóc dòng `result` để lấy `session_id`,
`num_turns`, `duration_ms`. Cùng dòng đó còn mang:

| Trường | Nội dung |
|---|---|
| `usage.input_tokens` · `output_tokens` | Token vào/ra |
| `usage.cache_read_input_tokens` · `cache_creation_input_tokens` | Đủ để tính tỉ lệ cache — thứ quyết định phần lớn chi phí ở khối việc này |
| `total_cost_usd` | Chi phí ước tính của lần chạy |
| `stop_reason` · `api_error_status` | **Vì sao lần chạy dừng** — phân biệt "code hỏng" với "hết hạn mức" |

Trường cuối là thứ đáng giá nhất. Hiện `record_run()` chỉ ghi `result` dạng
`ok`/`fail`, nên một lần chạy chết vì hết quota trông y hệt một lần chạy chết vì
test đỏ — hai chuyện đòi hai hành động hoàn toàn khác nhau.

**Cần một thay đổi nhỏ trong reconciler**: thêm mấy dòng `jq` vào `run_agent()`
và mấy trường vào `record_run()`. Theo ranh giới ở `AGENTS.md` §2, mọi thay đổi
trong `apps/reconciler/` phải **hỏi trước** — nên tôi nêu ra ở đây chứ không tự
làm.

Trạng thái dịch vụ lấy từ `https://status.claude.com/api/v2/status.json` (bản cũ
`status.anthropic.com` giờ chuyển hướng sang đây). Cấu trúc:
`{ page: {...}, status: { indicator, description } }`, với `indicator: "none"`
nghĩa là bình thường. Một route handler gọi theo lịch là đủ.

### Hạn mức: có trạng thái, **không có phần trăm**

Dò tiếp thì stream-json còn một loại thông điệp nữa ngoài `system` / `assistant` /
`result`, đó là **`rate_limit_event`**:

```json
{ "status": "allowed", "resetsAt": 1786624800,
  "rateLimitType": "five_hour", "overageStatus": "rejected",
  "isUsingOverage": false }
```

Đủ để nói **cửa sổ nào đang chặn** (`five_hour` / tuần), **còn dùng được hay
không** (`status`), và **bao giờ reset** (`resetsAt`).

**Nhưng không có con số phần trăm.** `total_cost_usd` là chi phí quy đổi theo giá
API, không phải mức tiêu thụ hạn mức của gói thuê bao. Không nguồn nào tôi kiểm
được cho ra `% tuần` / `% 5h`.

Nên mockup để **đồng hồ đếm ngược tới cửa sổ mới** thay vì vẽ một thanh phần trăm
không có thật — "còn 2h14m nữa agent chạy lại được" trả lời đúng câu người dùng
định hỏi, mà lại là số có thật.

---

## 4. Thứ tự làm

| | Việc | Đổi được gì | Rủi ro |
|---|---|---|---|
| **1** | Vỏ sidebar + làm mờ chrome | Lớn nhất — sửa cả 2.1 lẫn 2.2 | Thấp, chỉ đụng layout |
| **2** | Màn Tổng quan | Sửa 2.3 và 2.4 | Thấp; dữ liệu đã có sẵn |
| **3** | Siết phân cấp (eyebrow, viền, mật độ) | Đây là phần "đẹp lên" | Thấp |
| **4** | ⌘K + phím tắt | Sửa phần "dễ dùng" cho dân kỹ thuật | Trung bình |

Bốn bước độc lập nhau; dừng ở bất kỳ bước nào app vẫn chạy.

**Không đề xuất:** đổi hệ màu, đổi mặt chữ, hay dựng lại từ đầu. Linear nói
đúng: *"Một đợt redesign không nên tháo rời sản phẩm ra tới nguyên tử."* Vấn đề
nằm ở bố cục và phân cấp, không nằm ở bảng màu.

---

## Nguồn

- [How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [A calmer interface for a product in motion — Linear](https://linear.app/now/behind-the-latest-design-refresh)
- [Dashboard Design Patterns for Modern Web Apps 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [Organize and view your work — Plane](https://docs.plane.so/introduction/tutorials/organize-and-view-work)
- [Introducing Power K 2.0 — Plane](https://plane.so/blog/introducing-power-k-keyboard-first-navigation-and-actions)
- [Project Dashboards Best Practices 2026](https://docs.gitscrum.com/en/best-practices/creating-effective-project-dashboards/)
- [Command Palette UI Design — Mobbin](https://mobbin.com/glossary/command-palette)
