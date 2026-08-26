# Design system — Geist (theo Vercel)

Hệ thống giao diện của `apps/web`, học từ **Geist** — ngôn ngữ thiết kế của
Vercel. Nguồn phân tích: trang chủ, AI Gateway, customers, pricing của
vercel.com.

**Trạng thái:** đã áp vào `apps/web`. Token sống ở
[`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css); file này
là lý do đằng sau chúng.

---

## 1. Ý tưởng cốt lõi

Geist là một bài tập về **phép trừ**. Trang là một tờ giấy gần trắng
(`#fafafa`) mang mực gần đen (`#171717`), và gần như không có gì khác cạnh
tranh. Tiêu đề, nút chính, và đường viền 1px của mọi thẻ đều rút từ cùng một
thang mực-và-xám.

Ba luật khiến nó là Geist chứ không phải "một trang tối giản":

1. **Một tông mực gánh tất cả.** Heading, CTA, border — cùng `#171717`. Không
   có màu chrome.
2. **Đường tóc 1px là công cụ dựng hình chính**, không phải đổ bóng. Thẻ trắng
   trên nền gần trắng, tách nhau bằng `#ebebeb`.
3. **Chỉ một chỗ được phép có màu**: mesh gradient ở hero. Mọi nơi khác là mực
   trên trắng.

Chữ gánh phần còn lại: Geist Sans đặt display type với **tracking âm chặt**,
Geist Mono đặt các nhãn eyebrow viết hoa như tiêu đề của một bản spec kỹ thuật.

---

## 2. Ba quyết định khi áp vào app này

Vercel.com là trang **marketing**. `apps/web` là **công cụ nội bộ**. Bê nguyên
sẽ sai ở ba chỗ, và đây là cách xử lý — cũng là chỗ đáng đọc nhất của tài liệu
này.

### 2.1. Không có nút pill

Vercel dùng **hai** hình nút, và sự khác nhau giữa chúng tự nó là một tín hiệu:

| Hình | Ở đâu | Ví dụ |
|---|---|---|
| Pill 100px | Bề mặt marketing | "Start Deploying", "Get a Demo" |
| Vuông 6px | Nav và trong app | "Sign Up", "Log In", toàn bộ dashboard |

App này **không có bề mặt marketing nào**. Mọi nút ở đây là chrome ứng dụng,
nên tất cả dùng vuông 6px. Thêm một nút pill vào đây không phải là "dùng nhiều
design system hơn" — nó là nói dối về việc người dùng đang đứng ở đâu.

Token `--radius-pill` vẫn có, nhưng chỉ dùng cho **badge**, đúng như Vercel.

### 2.2. Mesh gradient chỉ xuất hiện ở trang đăng nhập

Đây là bề mặt duy nhất trong app có tính chất "hero": một màn hình, một hành
động, không có dữ liệu. Mọi màn hình khác là bảng và danh sách — đặt gradient
sau một danh sách công việc là đúng thứ mà mục "Don't" của Geist cấm.

Gradient dựng từ ba cặp màu lịch sử của Vercel (develop / preview / ship), pha
lại thành một mesh mềm ở opacity thấp.

### 2.3. Màu trạng thái giữ lại, nhưng chỉ ở dạng viền và chữ

Geist nói "đừng đổ màu accent lên bề mặt lớn". App này thì **bắt buộc** phải
phân biệt được đỏ với xanh: `bee/test` hỏng, repo bị dừng, reconciler chết —
đó là thông tin, không phải trang trí.

Cách hoà giải: màu trạng thái chỉ sống ở **chữ, viền 1px, và một chấm tròn
6px**. Không có nền màu nào rộng hơn một badge. Và bảng màu rút về đúng bảng
của Vercel thay vì màu tuỳ tiện:

| Trạng thái | Màu | Token |
|---|---|---|
| Tốt / đang chạy | `#0070f3` | `--color-link` |
| Cảnh báo | `#f5a623` | `--color-warning` |
| Hỏng | `#ee0000` | `--color-destructive` |
| Agent | `#7928ca` | `--color-violet` |

> Trước khi đổi, dải sức khoẻ dùng emerald/amber/violet/sky của Tailwind —
> bốn màu không thuộc bảng nào cả. Giờ chúng thuộc về một bảng có tên.

---

## 3. Màu

### Thang mực và nền

> **Cột "Tối" đã thay bằng VS Code Dark Modern (26/08).** Hình dạng, thang
> kích thước, bán kính và thang chữ bốn bậc bên dưới vẫn là Geist và vẫn đúng —
> chỉ bảng màu dark đổi. Lý do và giá trị gốc: `apps/web/src/app/globals.css`.
> Cột "Sáng" giữ nguyên Geist, nhưng hôm nay `<html>` ghim class `dark` cố định
> nên nhánh sáng không ai nhìn thấy.

| Vai trò | Sáng (Geist) | Tối (Dark Modern) | Token Tailwind |
|---|---|---|---|
| Chrome (sidebar, header) | `#ffffff` | `#181818` | `bg-chrome` · `bg-sidebar` |
| Canvas | `#fafafa` | `#1f1f1f` | `bg-background` |
| Bề mặt nổi (popover) | `#ffffff` | `#222222` | `bg-popover` |
| Thẻ | `#ffffff` | `#2b2b2b` | `bg-card` |
| Nền chìm | `#f2f2f2` | `#2b2b2b` | `bg-muted` |
| Nền ô nhập | — | `#313131` | `bg-field` |
| Mực (heading, CTA) | `#171717` | `#ffffff` | `text-foreground` |
| Chữ thường | `#4d4d4d` | `#cccccc` | `text-body` |
| Chữ mờ | `#8f8f8f` | `#9d9d9d` | `text-muted-foreground` |
| Chữ mờ nhất | `#a1a1a1` | `#6e7681` | `text-faint` |
| Đường tóc | `#ebebeb` | `#ffffff17` | `border-border` |
| Nhấn / focus | `#171717` | `#0078d4` | `bg-primary` · `ring-ring` |

**Trong dark, viền là TRẮNG MỜ chứ không phải một màu xám đục.** `#ffffff17`
tự chỉnh theo bề mặt bên dưới — trên sidebar `#181818` nó ra ~`#2d2d2d`, trên
thẻ `#2b2b2b` ra ~`#3e3e3e`. Một hằng số xám không làm được việc đó, và đây là
cách VS Code tách vùng (`editorGroup.border`).

**Chrome tối HƠN nội dung.** Sidebar và dải đầu trang `#181818` ôm lấy vùng làm
việc `#1f1f1f`, giống hệt sideBar/titleBar ôm editor trong VS Code. Đảo chiều
là mất ngay cấu trúc đó.

**Bốn bậc chữ là bốn bậc, không phải ba.** `text-body` (#4d4d4d) là bậc riêng
giữa mực và xám mờ; đây là chỗ Tailwind mặc định không có và là chỗ dễ làm mất
sắc thái nhất khi copy từ một hệ khác sang.

**Không đặt body copy bằng `#000000`.** Mực của hệ này là `#171717`.

### Màu nhấn

| Tên | Giá trị | Dùng ở đâu |
|---|---|---|
| Vercel Blue | `#0070f3` | Link, focus, trạng thái tốt |
| Violet | `#7928ca` | Nhãn agent |
| Error | `#ee0000` | Hỏng, phá huỷ |
| Warning | `#f5a623` | Tạm dừng, cần chú ý |
| Cyan · Pink · Magenta | `#50e3c2` · `#ff0080` · `#eb367f` | Chỉ trong gradient và minh hoạ |

### Gradient thương hiệu

Ba cặp hai điểm dừng, di sản của Vercel:

| Tên | Từ | Đến |
|---|---|---|
| Develop | `#007cf0` | `#00dfd8` |
| Preview | `#7928ca` | `#ff0080` |
| Ship | `#ff4d4d` | `#f9cb28` |

Pha ba cặp này lại thành mesh của hero.

---

## 4. Chữ

Toàn hệ chạy trên **Geist** — Geist Sans cho UI và văn xuôi, Geist Mono cho mã
và eyebrow. **Không có mặt chữ thứ ba.**

| Vai trò | Cỡ | Nặng | Tracking | Ở đâu trong app |
|---|---|---|---|---|
| `display-xl` | 48px | 600 | −0.05em | Không dùng — app không có hero marketing |
| `heading-lg` | 32px | 600 | −0.04em | `PageTitle` — tiêu đề trang |
| `heading-md` | 20px | 600 | −0.02em | Tiêu đề task |
| `mono-eyebrow` | 12px | 500 | 0 | Nhãn khu vực, viết HOA, Geist Mono |
| `body-md` | 14px | 400 | 0 | Mặc định |
| `body-sm` | 12px | 400 | 0 | Chú thích, metadata |
| `button-md` | 14px | 500 | 0 | Nhãn nút |
| `code` | 14px | 400 | 0 | Mã, SHA, tên nhãn, tên rule |

Tiện dụng: `tracking-display` · `tracking-heading` · `tracking-title`.

### Ba luật về chữ

1. **Càng to càng chặt.** Tracking âm tăng theo cỡ chữ. Nới tracking của
   heading lớn là làm hỏng đặc điểm nhận dạng rõ nhất của hệ này.
2. **Độ đậm là nhị phân.** 600 cho heading, 500 cho nút và nhãn, 400 cho phần
   còn lại. Không có light, không có black, không có nghiêng.
3. **Geist Mono chỉ có hai việc**: mã, và eyebrow viết hoa. Trong app này "mã"
   gồm cả tên nhãn (`agent:eligible`), tên rule (`07-build`), SHA, và
   `slug#số` — chúng là định danh kỹ thuật, không phải văn xuôi.

---

## 5. Hình và khoảng cách

### Bán kính

| Token | Giá trị | Dùng cho |
|---|---|---|
| `rounded-control` | 6px | Nút, input, select |
| `rounded-card` | 12px | Thẻ, khối mã, khối bằng chứng |
| `rounded-panel` | 16px | Bảng lớn |
| `rounded-pill` | 100px | Badge |
| `rounded-full` | 9999px | Chấm trạng thái, avatar |

Ngôn ngữ bán kính là **lưỡng cực**: vuông chặt 6px cho phần chức năng, pill
cho badge, 12–16px cho thẻ nội dung ở giữa.

Thang số của Tailwind cũng được ánh xạ để mọi primitive shadcn rơi đúng chỗ mà
không phải sửa file trong `components/ui/`: `rounded-lg` → 6px (nút, input),
`rounded-xl` → 12px (thẻ), `rounded-4xl` → pill (badge).

### Khoảng cách và thang kích thước

Đơn vị gốc **4.5px** (`--spacing: 0.28rem`), không phải 4px như Tailwind mặc
định.

Geist gốc là hệ chữ **dày đặc**: Vercel đặt body ở 14px, Linear ở 13px. Con số
đó hợp cho trang tài liệu đọc trên laptop 13"; trên màn hình lớn, dùng cả ngày,
nó nhỏ đến mức phải nhoài người về phía trước.

Nâng cả thang lên một bậc thay vì sửa từng chỗ: `--spacing` là gốc của **mọi**
tiện ích khoảng cách và chiều cao trong Tailwind v4 (`h-8` là
`calc(var(--spacing) * 8)`), nên nới nó lên 12% thì nút, ô nhập, chiều cao hàng,
padding và khoảng hở cùng lớn theo — **không phải đụng vào một file nào trong
`components/ui/`**.

Cỡ chữ nâng theo: 13 · 15 · 17 · 19 · 22 · 28px.

Ruột thẻ 24–32px. Khoảng giữa các khu vực 32–40px trong app (Vercel dùng
96–128px cho marketing — app có mật độ thông tin cao hơn nên nhịp chặt hơn).

**Padding nút chỉ theo chiều ngang**; chiều cao do line-height quyết định.

---

## 6. Độ nổi

| Bậc | Cách làm | Dùng cho |
|---|---|---|
| 0 — Phẳng | Viền 1px, không bóng | Mặc định: thẻ, input, đường kẻ |
| 1 — Thì thầm | Viền + `0 1px 1px rgba(0,0,0,.04)` | Thẻ nhô nhẹ |
| 2 — Nổi | `0 2px 2px` + `0 8px 16px -4px` alpha rất thấp | Menu, modal |

Độ nổi là thứ hệ này cố tình dùng ít nhất. Ưu tiên **một đường tóc 1px** hơn
một cái bóng.

---

## 7. Việc nên và không nên

### Nên

- Giữ canvas gần trắng, để mực gần đen gánh heading, CTA và viền.
- Dựng thẻ bằng viền 1px **trước khi** nghĩ tới bóng.
- Đặt heading bằng Geist Sans 600 với tracking âm chặt.
- Nhãn khu vực bằng Geist Mono viết HOA.
- Bước thang xám có chủ đích: mực → body → mute → faint.
- Định danh kỹ thuật (nhãn, rule, SHA) đặt bằng mono.

### Không nên

- **Không** đổ màu accent lên bề mặt lớn. Màu trạng thái sống ở chữ, viền, và
  một chấm — không phải ở nền.
- **Không** thêm nút pill vào app. Pill là của bề mặt marketing, mà app này
  không có.
- **Không** chồng bóng. Độ sâu là một đường tóc 1px.
- **Không** đặt body copy bằng `#000000`.
- **Không** thêm hệ trang trí thứ hai. Mesh gradient ở trang đăng nhập là thứ
  duy nhất, và nó chỉ ở đó.
- **Không** nới tracking của heading lớn.
- **Không** sửa tay file trong `components/ui/` để đổi giao diện — đổi token
  trong `globals.css`. Một lần chạy lại `shadcn add` sẽ ghi đè mọi sửa tay.

---

## 8. Chỗ cố ý khác Vercel

| | Vercel | Ở đây | Vì sao |
|---|---|---|---|
| Nút pill | Có, cho CTA marketing | Không dùng | App không có bề mặt marketing |
| Mesh gradient | Hero trang chủ | Chỉ trang đăng nhập | Màn hình duy nhất có tính hero |
| Nhịp khu vực | 96–128px | 32–40px | App có mật độ thông tin cao hơn trang bán hàng |
| Màu trạng thái | Gần như không có | Có, hạn chế ở viền và chữ | Đỏ với xanh ở đây là thông tin, không phải trang trí |
| `display-xl` 48px | Hero h1 | Không dùng | Tiêu đề trang dừng ở 32px |
