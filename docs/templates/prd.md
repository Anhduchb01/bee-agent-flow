# [Tên Dự Án/Sản Phẩm] — Product Requirements Document (PRD)

> **Cách dùng:** Copy file này thành `docs/PRD_<ten-tinh-nang>.md` cho mỗi tính năng/sản phẩm.
> Sau khi PRD được **Approved**, chạy `/spec` rồi `/planning` để chuyển PRD thành spec kỹ thuật và task list.

| | |
| --- | --- |
| **Trạng thái** | [Draft / In Review / Approved] |
| **Phiên bản** | [1.0] |
| **Người tạo (Product Owner)** | [Tên của bạn] |
| **Team tham gia** | [Ví dụ: Team Backend A, Team Frontend B, QC] |
| **Ngày cập nhật cuối** | [DD/MM/YYYY] |

---

## 1. Tổng quan dự án* (Project Overview)

### 1.1 Vấn đề và Mục tiêu (Problem & Objective)

- **Vấn đề hiện tại:** [Mô tả ngắn gọn khó khăn mà người dùng hoặc doanh nghiệp đang gặp phải. VD: Quá trình tạo báo cáo doanh thu thủ công tốn nhiều thời gian và dễ sai sót.]
  - **Cho ai** (công ty / đội nhóm / bản thân...): Muốn gì và Sợ gì?
  - **Bối cảnh:** Hiện trạng là gì? Khó khăn, trở ngại gì? Đối thủ?
  - **Hiện trạng** (Nội bộ – nguồn lực bên trong / Thị trường): Ưu và nhược điểm.
- **Mục tiêu (Objective):** [Tính năng/sản phẩm này giải quyết vấn đề đó như thế nào? VD: Tự động hóa quá trình xuất báo cáo doanh thu hàng ngày.]

### 1.2 Giá trị mang lại (Value Proposition)

- [Tại sao chúng ta làm tính năng này? Giá trị kinh doanh (tăng doanh thu, giảm chi phí) hoặc giá trị người dùng (tiết kiệm thời gian, tăng trải nghiệm) là gì?]
- Giải quyết vấn đề gì?

### 1.3 Tiêu chí Thành công (Success Metrics / KPIs)

- [Làm sao để biết tính năng này thành công sau khi release? VD:]
- **Tỷ lệ áp dụng (Adoption rate):** 30% user sử dụng tính năng trong tuần đầu.
- **Hiệu năng:** Giảm thời gian load trang báo cáo từ 5s xuống < 1s.

---

## 2. Đối tượng và Luồng người dùng* (Users & User Flows)

### 2.1 User Personas (Chân dung người dùng)

- **Persona 1:** [VD: Kế toán trưởng — Cần xem số liệu tổng quan và xuất Excel.]
- **Persona 2:** [VD: Nhân viên Sales — Cần xem chi tiết từng đơn hàng.]

### 2.2 User Stories

- **US-01:** Là một [Kế toán trưởng], tôi muốn [xuất báo cáo tổng hợp theo tháng], để [báo cáo cho Ban Giám Đốc].
- **US-02:** Là một [Nhân viên Sales], tôi muốn [lọc đơn hàng theo trạng thái], để [theo dõi tiến độ giao hàng].

### 2.3 User Flow (Sơ đồ luồng)

- [Chèn link tới sơ đồ Miro, Lucidchart, hoặc mô tả các bước cơ bản mà người dùng thực hiện.]

---

## 3. Yêu cầu Chức năng* (Functional Requirements)

> Phần này mô tả chi tiết những gì hệ thống **PHẢI** làm. Chia nhỏ theo các Epic / Tính năng lớn.
> Ưu tiên: **P0** (Must) · **P1** (Should) · **P2** (Nice to have).

### Epic 1: [Tên Epic — VD: Quản lý Báo Cáo]

| ID | Tính năng (Feature) | Mô tả chi tiết (Logic/Luồng) | Tiêu chí nghiệm thu (Acceptance Criteria) | Ưu tiên |
| --- | --- | --- | --- | --- |
| FR-1.1 | Bộ lọc thời gian | User chọn khoảng thời gian (Từ ngày – Đến ngày). Mặc định là tháng hiện tại. | • Giao diện hiển thị đúng calendar.<br>• Không chọn được ngày trong tương lai. | P0 (Must) |
| FR-1.2 | Xuất file Excel | Cho phép tải xuống dữ liệu đang hiển thị dưới dạng `.xlsx`. | • File đúng format thiết kế.<br>• Thời gian export < 5s cho 10k dòng. | P0 (Must) |
| FR-1.3 | Lưu bộ lọc | Cho phép user lưu lại thông số lọc để dùng nhanh lần sau. | • Có nút "Lưu bộ lọc".<br>• Có danh sách các bộ lọc đã lưu. | P2 (Nice to have) |

### Epic 2: [Tên Epic tiếp theo]

| ID | Tính năng | Mô tả chi tiết | Tiêu chí nghiệm thu | Ưu tiên |
| --- | --- | --- | --- | --- |
| FR-2.1 | [...] | [...] | [...] | [...] |

---

## 4. Yêu cầu Phi chức năng* (Non-Functional Requirements)

- **Hiệu suất (Performance):** [API response time < 200ms, hệ thống chịu được 1000 CCU.]
- **Bảo mật (Security):** [Dữ liệu nhạy cảm cần được mã hóa. API xác thực bằng JWT token.]
- **Khả năng mở rộng (Scalability):** [Thiết kế DB lưu trữ dữ liệu lịch sử 5 năm mà không làm chậm hệ thống.]
- **Nền tảng (Platform/Browsers):** [Hỗ trợ Chrome, Safari, Firefox bản mới nhất. Responsive trên mobile.]

---

## 5. Yêu cầu về Thiết kế (Design Requirements)

- **Link Figma/Wireframes:** [Chèn link thiết kế UI/UX]
- **Ghi chú thiết kế:** [Các trạng thái cần chú ý: Empty state, Error state, Loading state.]

---

## 6. Yêu cầu Kỹ thuật & Tích hợp (Technical & Data Requirements)

> Thường do Tech Lead / System Analyst bổ sung.

- **Kiến trúc/Database:** [Bảng dữ liệu mới cần tạo, các trường cần index.]
- **Tích hợp (Integrations):** [Cần gọi API sang Payment Gateway, gửi event sang CRM...]
- **Tracking/Analytics:** [Bắn event Google Analytics khi user click "Xuất Excel".]

---

## 7. Kế hoạch Triển khai* (Go-to-Market & Release Plan)

### 7.1 Lộ trình (Phases)

- **Phase 1 (MVP — Dự kiến Release: [Ngày]):** [Chỉ gồm các tính năng P0 (Must-have). VD: Bộ lọc cơ bản + xuất Excel.]
- **Phase 2 (Optimization — Dự kiến Release: [Ngày]):** [Thêm tính năng P1, P2. VD: Lưu bộ lọc + xuất PDF.]

### 7.2 Đánh giá Rủi ro (Risks & Mitigations)

| Rủi ro (Risk) | Mức độ | Phương án xử lý (Mitigation) |
| --- | --- | --- |
| API bên thứ 3 chậm | Cao | Cơ chế retry + caching dữ liệu. Hiển thị thông báo thân thiện cho user. |
| Tech nợ (Technical debt) | Trung bình | Dành 10% effort của Sprint tiếp theo để refactor code. |

---

## 8. Phụ lục (Appendix)

- **Thuật ngữ (Glossary):** [Giải thích từ viết tắt chuyên ngành. VD: CCU = Concurrent Users.]
- **Tài liệu liên quan:** [Link tới API Docs, tài liệu thiết kế hệ thống.]

---

> _Mục có dấu `*` là bắt buộc phải điền trước khi chuyển trạng thái sang **In Review**._
