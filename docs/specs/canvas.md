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
skill bee-*      →  SAU khi gh thành công, append một dòng vào run.jsonl
                    (ghi bằng jq — title có ký tự lạ vẫn là JSON hợp lệ):
                    {"type":"bee_artifact","kind":"issue"|"pr",
                     "url":"https://github.com/…","number":41,"ts":"…",
                     "title":"…"}                       ← title thêm 17/08
parse-events.ts  →  whitelist thêm bee_artifact → SuKien loai:"artifact"
BeeSource        →  sessionArtifacts(id) — disk: quét run.jsonl lọc dòng
                    bee_artifact (unknown-narrowing); fixture: dữ liệu mẫu
                 →  sessionPreview(id) — câu text CUỐI của assistant, đi từ
                    đuôi file lên, gọn một dòng ≤ 140 ký tự
```

- Ghi qua `run.jsonl` chứ không qua meta để artifact **mọc ra live** ngay
  trong lúc đang xem phiên — SSE nhặt trong ≤ 500ms, cùng đường với mọi thứ.
- Skill chỉ ghi khi `BEE_SESSION_DIR` tồn tại — chạy ngoài phiên bee (laptop)
  thì skill vẫn dùng được, không nổ.
- Dòng ghi bằng `printf >>` — append nguyên tử với dòng ngắn, an toàn cạnh
  runner và cạnh `bee_user_say` của web.

## 2. Trang `/canvas`

- **Tạo phiên ngay trên canvas** *(chốt lại 17/08)*: form nổi góc trên-trái
  (React Flow `Panel`) — **chọn repo từ danh sách ĐÃ ĐĂNG KÝ** (`repos.d/`,
  qua `BeeSource.listRepos`) hoặc *"No repo — just chat"*. **Không có ô gõ
  repo tự do** — repo mới phải đăng ký trước (PAT phủ + branch protection,
  doctor kiểm được); guard ở CẢ action lẫn runner (`unregistered-repo`,
  rig-03 §2b) — đường "clone bất cứ gì được gõ vào" đã bị giết. Tạo xong
  panel chat mở tại chỗ, node hiện sau `router.refresh`.
- **Phiên có repo LUÔN có worktree ngay từ đầu** — không còn checkbox, không
  còn bài "nâng cấp chat→work": chi phí thật chỉ là clone lần đầu mỗi repo
  (đã cache bare), mỗi phiên sau tốn fetch + worktree add vài giây có
  lifecycle hiển thị. Interview đứng trong worktree nên thấy CLAUDE.md —
  hợp đồng đỡ "mù". "OK, do it" là chuyển pha đã chứng minh (rig S0.2).
- **Chat chỉ còn một dạng: không repo** (`worktree:false`, `repo:""`, slug
  `chat`, nhóm "Chats" cuối danh sách): runner bỏ qua toàn bộ clone/worktree
  (cwd `sessions/<id>/chat/`) và **không bao giờ cấp tool** kể cả khi ai đó
  sửa tay `phase:"work"`. Không có đường nâng cấp — chẳng có repo để nâng
  lên; muốn làm thật thì mở phiên repo.

- **Server dựng đồ thị, client chỉ vẽ.** `build-graph.ts` là hàm THUẦN
  (test được): `(nhóm phiên, artifacts) → {nodes, edges}` với layout tính
  sẵn — repo là cột, phiên xếp dọc trong cột, artifact dạt phải phiên của nó.
- Node phiên *(preview thêm 17/08)*: title · **câu cuối agent nói** (nghiêng,
  tối đa 2 dòng — node kể được chuyện đang tới đâu) · `bee/<slug>-<n>` ·
  tuổi ("2h ago") · StatusDot tone theo status, `needs_human` viền đỏ.
  **Click → panel chat mở NGAY TRÊN canvas** (Sheet bên phải chứa đúng
  LiveView của trang riêng — một nguồn sự thật, hai chỗ vẽ); link `↗` trong
  node đi sang `/sessions/<id>` trọn trang.
- Node artifact *(preview thêm 17/08)*: ký hiệu màu theo ngôn ngữ GitHub
  (◉ xanh lá = issue, ⇄ tím = PR) · `#<số>` · **title** (2 dòng) · tuổi.
  Click → mở GitHub tab mới. *Trạng thái sống (merged/closed) là dữ liệu
  GitHub-side — V2, cần `lib/github`, không nằm trong bee_artifact.*
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
hook-reply approvals (ô riêng ở session-first §11 — rig trước) · kanban view ·
node phóng to tại chỗ chứa chat (V1 dùng Sheet — rẻ và mobile-friendly; node
to trong React Flow cần xử lý `nodrag`/`nowheel` và wheel-conflict) ·
**terminal node thật** (xterm.js + PTY + tmux — cửa thoát hiểm cho TUI, xếp
sau V2: cần WebSocket server riêng cạnh Next.js và mất toàn bộ cấu trúc sự
kiện trên đường đó, xem trao đổi 17/08).
