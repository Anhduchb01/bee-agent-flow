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

### 3.2. Màn Tổng quan — chỉ những gì đổi hành vi

Bốn khối, xếp theo thứ tự đọc:

**a. Cần bạn ngay** — 4 ô, mỗi ô **bấm được** và lọc thẳng sang bảng việc.
Không phải bốn con số chết như hiện tại.

**b. Chặn lâu nhất** — 5 dòng đầu bảng việc, kèm thời gian chờ. Đây là khối trả
lời "cái gì đang thối rữa".

**c. Máy đang làm gì** — dải các việc đang chạy, kèm đồng hồ. Thứ duy nhất trên
màn hình thay đổi theo thời gian thực, nên nó đáng một khối riêng.

**d. Bảy ngày qua** — biểu đồ cột nhỏ: mỗi ngày bao nhiêu lần chạy xanh/đỏ.
Dựng từ `recent.jsonl` đã có sẵn. **Đây là chỉ số xu hướng duy nhất tôi đề
xuất** — nó trả lời "máy có đang tệ đi không", và câu đó đổi hành vi.

**Cố ý KHÔNG đưa lên** (chỉ số phù phiếm, theo đúng danh sách trong tài liệu đã
tra): tổng số task · số commit · số dòng code · số giờ · tổng task đã xong.

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
