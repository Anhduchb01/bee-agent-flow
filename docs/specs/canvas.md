# SPEC — S6 Canvas: phiên và artifact như đồ thị

Bổ sung cho [`session-first.md`](session-first.md), sinh từ research nodeterm
(17/08/2026). UX vay ý tưởng canvas của nodeterm; **code không vay** — canvas
là `@xyflow/react` (React Flow, MIT), không dính BUSL.

**Ý một câu:** issue/PR không phải thẻ ngang hàng đồng bộ bằng label (cách
nodeterm làm — đúng mô hình bee đã từ chối); chúng là **sản phẩm phụ mọc ra
từ phiên**, vẽ thành node nối edge về phiên đẻ ra chúng. Canvas là *cách vẽ
thứ hai của cùng dữ liệu* mà session list đang đọc — không API mới, không DB.

---

## 1. Sự kiện `bee_artifact` — mắt xích duy nhất còn thiếu

```
session-run.sh   →  export BEE_SESSION_DIR=$SDIR vào env của claude
skill bee-*      →  SAU khi gh thành công, append một dòng vào run.jsonl:
                    {"type":"bee_artifact","kind":"issue"|"pr",
                     "url":"https://github.com/…","number":41,"ts":"…"}
parse-events.ts  →  whitelist thêm bee_artifact → SuKien loai:"artifact"
BeeSource        →  sessionArtifacts(id) — disk: quét run.jsonl lọc dòng
                    bee_artifact (unknown-narrowing); fixture: dữ liệu mẫu
```

- Ghi qua `run.jsonl` chứ không qua meta để artifact **mọc ra live** ngay
  trong lúc đang xem phiên — SSE nhặt trong ≤ 500ms, cùng đường với mọi thứ.
- Skill chỉ ghi khi `BEE_SESSION_DIR` tồn tại — chạy ngoài phiên bee (laptop)
  thì skill vẫn dùng được, không nổ.
- Dòng ghi bằng `printf >>` — append nguyên tử với dòng ngắn, an toàn cạnh
  runner và cạnh `bee_user_say` của web.

## 2. Trang `/canvas`

- **Server dựng đồ thị, client chỉ vẽ.** `build-graph.ts` là hàm THUẦN
  (test được): `(nhóm phiên, artifacts) → {nodes, edges}` với layout tính
  sẵn — repo là cột, phiên xếp dọc trong cột, artifact dạt phải phiên của nó.
- Node phiên: title, `bee/<slug>-<n>`, StatusDot tone theo status,
  `needs_human` viền đỏ. Click → `/sessions/<id>`.
- Node artifact: `#<số>` + kind. Click → mở GitHub tab mới.
- Edge: phiên → artifact, một chiều, không tương tác.
- Kéo node được (React Flow mặc định) nhưng **V1 không lưu vị trí** — reload
  về auto-layout. Lưu vị trí (file json do web sở hữu, kiểu
  `.nodeterm/project.json`) là việc sau, ghi ở §4.
- Sidebar thêm mục Canvas.

## 3. Ranh giới & kiểm thử

- `@xyflow/react` là dependency runtime mới — đã hỏi và được duyệt 17/08.
- Artifact render là **link + text thuần**, không markdown (cùng luật §4.1 PRD).
- URL trong `bee_artifact` phải bắt đầu `https://github.com/` mới được render
  thành link — nội dung run.jsonl là untrusted, không mở cửa `javascript:`.
- Test: parse-events nhận/loại `bee_artifact` đúng · trích artifact từ
  run.jsonl tmp (disk) · `build-graph` ra đúng node/edge/lớp · component
  canvas render được nhóm rỗng.

## 4. Ngoài phạm vi (ghi để khỏi lẻn vào)

Lưu vị trí node · node evidence/diff · edge agent-đọc-context-của-nhau ·
hook-reply approvals (ô riêng ở session-first §11 — rig trước) · kanban view.
