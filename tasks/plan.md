# Plan triển khai — V1 Sessions Live (session-first)

**Lập:** 2026-08-17 · **Thay thế:** plan V1 Live cùng ngày (mô hình hai UID,
giữ ở nhánh `feat/bee-m3-and-web-spec`)
**Nguồn:** [`docs/specs/session-first.md`](../docs/specs/session-first.md) ·
[`docs/PRD_bee-agent-flow.md`](../docs/PRD_bee-agent-flow.md) (3.0)

---

## Chuyện gì đã xảy ra với plan cũ

PRD 3.0 chốt mô hình **A+ một UID**: cầu socket, broker, sudoers, hàng đợi
nhãn — toàn bộ phần "vượt ranh giới UID" của plan cũ **biến mất khỏi đường
găng**. Những gì mất nghĩa: L3.1 (bee-request.path), L3.2 (web ghi yêu cầu qua
spool), phần sudoers/polkit của L1.

Những gì **giữ nguyên giá trị** và chuyển thẳng sang plan này:

- **L0.1 rig stream-json hai chiều** — vẫn là ẩn số số một, không đổi một chữ.
- Toàn bộ L2 (parse-events, SSE, màn live) — thiết kế đường-ra không phụ thuộc
  mô hình UID.
- Kinh nghiệm bash của reconciler (worktree, dọn xác, heartbeat) — port sang
  `apps/runner/`, không viết lại từ đầu.

Web 15 slice trên fixture dùng lại; hộp thư 5 loại và choreography issue thì
không — sẽ gỡ ở V4, chưa đụng bây giờ.

---

## Điều quyết định thứ tự

Vẫn là ẩn số cũ, cộng một ẩn số mới cùng họ:

1. **Gõ chen lúc agent giữa tool call** — CLI xếp hàng hay bỏ? Quyết định lời
   hứa của ô gõ.
2. **Phỏng vấn không tool → `--resume` với đủ tool** — phiên có nhớ đủ ngữ
   cảnh phỏng vấn không? Quyết định "ok làm đi" có thật là *một* phiên hay
   phải hai.

Cả hai nằm trong **S0**, chung một rig, rẻ, không cần máy Ubuntu, và trả về
fixture `run.jsonl` thật cho toàn bộ S2.

---

## Đồ thị phụ thuộc

```
S0  rig hai ẩn số + fixture thật ──────┬──────────────────────┐
                                       │                      │
                                       ▼                      ▼
                     S1 · apps/runner (bash)        S2 · web đọc luồng (fixture)
                     ├ S1.1 session-run.sh          ├ S2.1 parse-events (thuần)
                     ├ S1.2 units + linger          ├ S2.2 route SSE
                     ├ S1.3 reaper                  └ S2.3 màn live + session list
                     └ S1.4 doctor (A+ checklist)             │
                                       │                      │
                                       └──────────┬───────────┘
                                                  ▼
                                S3 · nối: start/say/stop + hai chế độ
                                ├ S3.1 server actions (systemctl --user + file)
                                ├ S3.2 "ok làm đi" = chuyển phase
                                └ S3.3 skills: issue / push-pr / update-pr
                                                  │
                                                  ▼
                                S4 · máy thật + vệ sinh A+ (🧑 nhiều)
                                ├ S4.1 PAT hẹp + branch protection   🧑
                                ├ S4.2 cài runner, login Claude      🧑
                                └ S4.3 nghiệm thu rig 6 bài (spec §8)
                                                  │
                                                  ▼
                                S5 · ra internet
                                ├ S5.1 GitHub OAuth allowlist
                                ├ S5.2 Cloudflare Access             🧑
                                └ S5.3 nghiệm thu từ điện thoại = V1 xong
```

S1 ∥ S2 chạy song song sau S0. S3 cần cả hai. S4/S5 tuần tự.

---

## Checkpoint có người

| Sau | Bạn duyệt gì |
|---|---|
| **S0** | Kết quả hai ẩn số — nếu CLI bỏ tin nhắn gõ chen, hoặc resume mất ngữ cảnh, **dừng lại bàn** trước khi UI hứa gì |
| **S1** | Review riêng phần bash (spec §3) — `session-run.sh` là chỗ mọi phiên đi qua |
| **S2** | Bố cục màn live + session list trên fixture, trước khi nối máy thật |
| **S4.3** | 6 bài rig xanh trên máy thật — đây là nghiệm thu thật, code xong không phải xong |

---

## Ngoài phạm vi V1 (đừng để lẻn vào)

Nút merge (V2) · hàng đợi + đi ngủ + phanh hạn mức (V3) · gỡ code mô hình cũ
(V4) · markdown trong live view · mở khoá dần theo repo.
