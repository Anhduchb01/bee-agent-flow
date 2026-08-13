/**
 * Bộ dữ liệu GitHub giả lập, dựng để **cả năm loại mục của hộp thư** đều có mặt
 * và xếp hạng được — xem `docs/specs/web.md` §4.1.
 *
 * Nhãn dùng đúng bộ từ vựng thật của reconciler (`repo_sync_labels()` trong
 * `bin/bee`), và điều kiện của từng loại lấy từ `rule_scan()` của từng rule chứ
 * không phải từ trí nhớ. Cụ thể: rule 07 chạy khi issue có **cả** `agent:build`
 * lẫn `agent:eligible`, nên "chờ cho phép nhận task" là trạng thái có
 * `agent:build` mà **thiếu** `agent:eligible`.
 *
 * Mốc thời gian tính lùi từ lúc app khởi động, để thứ tự "chờ lâu nhất lên
 * đầu" luôn có nghĩa dù chạy ngày nào.
 */
import type { GhComment, GhTask, GhUser } from "@/lib/github/types";

export const PM: GhUser = { login: "pm-linh", name: "Nguyễn Thị Linh", avatar_url: "" };
export const TL: GhUser = { login: "tl-duc", name: "Phạm Đức", avatar_url: "" };
/** Agent không có tài khoản riêng — nó viết dưới tên chủ token orch. */
export const ORCH: GhUser = { login: "bee-orch", name: "bee (agent)", avatar_url: "" };

const MIN = 60;
const HOUR = 60 * MIN;

function iso(secondsAgo: number, base: Date): string {
  return new Date(base.getTime() - secondsAgo * 1000).toISOString();
}

function body(parts: {
  goal: string;
  acceptance: string[];
  constraints: string[];
  outOfScope: string[];
  ui: string;
}): string {
  return [
    "### Mục tiêu",
    "",
    parts.goal,
    "",
    "### Acceptance Criteria",
    "",
    ...parts.acceptance.map((a) => `- [ ] ${a}`),
    "",
    "### Ràng buộc kỹ thuật",
    "",
    ...parts.constraints.map((c) => `- ${c}`),
    "",
    "### Out of scope",
    "",
    ...parts.outOfScope.map((o) => `- ${o}`),
    "",
    "### UI Reference",
    "",
    parts.ui,
  ].join("\n");
}

export interface GithubSeed {
  repos: { slug: string; full: string }[];
  tasks: GhTask[];
  /** Khoá là `<slug>#<số issue>`. */
  timeline: Record<string, GhComment[]>;
  nextIssueNumber: Record<string, number>;
  nextCommentId: number;
}

export function seedGithub(base: Date = new Date()): GithubSeed {
  const at = (s: number) => iso(s, base);

  const tasks: GhTask[] = [
    // ── myapp ───────────────────────────────────────────────────────────────
    {
      slug: "myapp",
      number: 38,
      title: "Thêm bộ lọc trạng thái cho danh sách đơn hàng",
      body: body({
        goal: "Người vận hành lọc được đơn theo trạng thái để tìm đơn cần xử lý mà không phải cuộn hết trang.",
        acceptance: [
          "Given danh sách đơn, When chọn trạng thái “Chờ xử lý”, Then chỉ đơn ở trạng thái đó hiện ra.",
          "Given đã lọc, When tải lại trang, Then bộ lọc vẫn giữ nguyên.",
        ],
        constraints: [
          "Chỉ đụng module đơn hàng; không sửa module thanh toán.",
          "Giữ nguyên response shape của GET /orders — client mobile đang dùng.",
        ],
        outOfScope: ["Không làm phân trang (sẽ có issue riêng).", "Không refactor bảng hiện tại."],
        ui: "Figma: khối filter nằm ngay trên bảng, dạng chip.",
      }),
      labels: ["status:spec-review"],
      author: PM,
      created_at: at(5 * HOUR),
      updated_at: at(3 * HOUR + 20 * MIN),
      url: "https://github.com/org/myapp/issues/38",
      state: "open",
      pull: null,
    },
    {
      slug: "myapp",
      number: 40,
      title: "Lọc đơn hàng theo trạng thái",
      body: body({
        goal: "Bản dựng của #38, đã có PR và bằng chứng.",
        acceptance: [
          "Given danh sách đơn, When chọn trạng thái, Then chỉ đơn khớp hiện ra.",
          "Given đã lọc, When tải lại trang, Then bộ lọc vẫn giữ nguyên.",
        ],
        constraints: ["Chỉ đụng module đơn hàng."],
        outOfScope: ["Không làm phân trang."],
        ui: "Như #38.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: PM,
      created_at: at(28 * HOUR),
      updated_at: at(2 * HOUR + 5 * MIN),
      url: "https://github.com/org/myapp/issues/40",
      state: "open",
      pull: {
        number: 45,
        title: "feat(orders): lọc theo trạng thái",
        url: "https://github.com/org/myapp/pull/45",
        draft: false,
        head_sha: "9f3c1ab",
        checks: [{ name: "bee/test", conclusion: "success" }],
        reviews: [],
      },
    },
    {
      slug: "myapp",
      number: 41,
      title: "Gộp hai màn hình cấu hình thông báo",
      body: body({
        goal: "Người dùng chỉnh mọi cấu hình thông báo ở một chỗ.",
        acceptance: ["Given trang cấu hình, When mở, Then thấy cả email lẫn push trong một form."],
        constraints: ["Không đổi schema bảng notification_settings."],
        outOfScope: ["Không thêm kênh Slack."],
        ui: "Không có UI mới, chỉ gộp hai trang đã có.",
      }),
      labels: ["agent:build"],
      author: TL,
      created_at: at(9 * HOUR),
      updated_at: at(HOUR + 5 * MIN),
      url: "https://github.com/org/myapp/issues/41",
      state: "open",
      pull: null,
    },
    {
      slug: "myapp",
      number: 42,
      title: "Thêm trang cài đặt thông báo",
      body: body({
        goal: "Người dùng bật/tắt từng loại thông báo.",
        acceptance: ["Given trang cài đặt, When tắt một loại, Then không nhận thông báo loại đó nữa."],
        constraints: ["Dùng lại form component đã có."],
        outOfScope: ["Không làm thông báo đẩy trên di động."],
        ui: "Figma: danh sách toggle.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:running"],
      author: PM,
      created_at: at(6 * HOUR),
      updated_at: at(12 * MIN),
      url: "https://github.com/org/myapp/issues/42",
      state: "open",
      pull: null,
    },
    {
      slug: "myapp",
      number: 44,
      title: "Export danh sách ra CSV",
      body: body({
        goal: "Người vận hành tải danh sách đang lọc ra CSV để gửi kế toán.",
        acceptance: ["Given danh sách đã lọc, When bấm Export, Then tải về CSV đúng số dòng đang hiện."],
        constraints: ["Không tải toàn bộ bảng vào bộ nhớ."],
        outOfScope: ["Không làm export XLSX."],
        ui: "Nút Export cạnh khối filter.",
      }),
      labels: ["agent:build", "agent:eligible"],
      author: PM,
      created_at: at(4 * HOUR),
      updated_at: at(40 * MIN),
      url: "https://github.com/org/myapp/issues/44",
      state: "open",
      pull: null,
    },
    {
      slug: "myapp",
      number: 47,
      title: "Sửa lỗi hiển thị ngày ở màn hình chi tiết đơn",
      body: body({
        goal: "Ngày hiện đúng múi giờ Việt Nam.",
        acceptance: ["Given đơn tạo lúc 23:30 giờ VN, When mở chi tiết, Then hiện đúng ngày hôm đó."],
        constraints: ["Không đổi cách lưu trong DB (vẫn UTC)."],
        outOfScope: ["Không làm chọn múi giờ theo người dùng."],
        ui: "Không có UI mới.",
      }),
      labels: ["needs-human"],
      author: TL,
      created_at: at(2 * 24 * HOUR),
      updated_at: at(6 * HOUR + 40 * MIN),
      url: "https://github.com/org/myapp/issues/47",
      state: "open",
      pull: null,
    },
    {
      slug: "myapp",
      number: 49,
      title: "Cho phép huỷ đơn trong 15 phút đầu",
      body: body({
        goal: "Khách tự huỷ đơn mới đặt mà không cần gọi tổng đài.",
        acceptance: ["Given đơn đặt dưới 15 phút, When bấm Huỷ, Then đơn chuyển sang trạng thái đã huỷ."],
        constraints: ["Phải ghi audit log cho mỗi lần huỷ."],
        outOfScope: ["Không làm hoàn tiền tự động."],
        ui: "Nút Huỷ trong trang chi tiết đơn.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: TL,
      created_at: at(30 * HOUR),
      updated_at: at(50 * MIN),
      url: "https://github.com/org/myapp/issues/49",
      state: "open",
      pull: {
        number: 52,
        title: "feat(orders): huỷ đơn trong 15 phút",
        url: "https://github.com/org/myapp/pull/52",
        draft: true,
        head_sha: "c71e004",
        checks: [{ name: "bee/test", conclusion: "pending" }],
        reviews: [],
      },
    },
    {
      slug: "myapp",
      number: 50,
      title: "Đổi cách đánh số hoá đơn",
      body: body({
        goal: "Số hoá đơn theo định dạng kế toán yêu cầu.",
        acceptance: ["Given hoá đơn mới, When tạo, Then số có dạng HD-YYYY-NNNN."],
        constraints: ["Không đổi hoá đơn cũ."],
        outOfScope: ["Không làm xuất hoá đơn điện tử."],
        ui: "Không có UI.",
      }),
      labels: ["status:ready-for-spec"],
      author: PM,
      created_at: at(50 * MIN),
      updated_at: at(50 * MIN),
      url: "https://github.com/org/myapp/issues/50",
      state: "open",
      pull: null,
    },

    // ── shop ────────────────────────────────────────────────────────────────
    {
      slug: "shop",
      number: 12,
      title: "Hiển thị lịch sử giá của sản phẩm",
      body: body({
        goal: "Khách thấy giá đã đổi thế nào trong 90 ngày.",
        acceptance: ["Given trang sản phẩm, When mở tab Lịch sử giá, Then thấy biểu đồ 90 ngày."],
        constraints: ["Đọc từ bảng price_history đã có."],
        outOfScope: ["Không làm cảnh báo giảm giá."],
        ui: "Figma: tab thứ ba trong trang sản phẩm.",
      }),
      labels: ["status:spec-review"],
      author: PM,
      created_at: at(3 * HOUR),
      updated_at: at(HOUR + 15 * MIN),
      url: "https://github.com/org/shop/issues/12",
      state: "open",
      pull: null,
    },
    {
      slug: "shop",
      number: 30,
      title: "Tính thuế theo vùng",
      body: body({
        goal: "Đơn hàng tính đúng thuế theo tỉnh giao hàng.",
        acceptance: ["Given địa chỉ giao ở tỉnh có thuế riêng, When đặt hàng, Then tổng tiền tính đúng thuế."],
        constraints: ["Bảng thuế nạp từ file cấu hình, không hardcode."],
        outOfScope: ["Không làm thuế quốc tế."],
        ui: "Không có UI mới, chỉ đổi con số ở bước thanh toán.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: TL,
      created_at: at(2 * 24 * HOUR),
      updated_at: at(4 * HOUR + 30 * MIN),
      url: "https://github.com/org/shop/issues/30",
      state: "open",
      pull: {
        number: 37,
        title: "feat(checkout): thuế theo vùng",
        url: "https://github.com/org/shop/pull/37",
        draft: false,
        head_sha: "4b21d70",
        checks: [{ name: "bee/test", conclusion: "success" }],
        reviews: [{ author: TL, state: "APPROVED", submitted_at: at(4 * HOUR) }],
      },
    },
    {
      slug: "shop",
      number: 33,
      title: "Đổi luồng thanh toán",
      body: "### Mục tiêu\n\nCòn đang viết.",
      labels: ["status:draft"],
      author: PM,
      created_at: at(20 * MIN),
      updated_at: at(20 * MIN),
      url: "https://github.com/org/shop/issues/33",
      state: "open",
      pull: null,
    },
    {
      slug: "shop",
      number: 36,
      title: "Sửa lỗi tính thuế cho đơn có mã giảm giá",
      body: body({
        goal: "Thuế tính trên số tiền sau giảm giá.",
        acceptance: ["Given đơn có mã giảm 10%, When tính thuế, Then thuế tính trên số sau giảm."],
        constraints: ["Không đổi cách lưu mã giảm giá."],
        outOfScope: ["Không làm mã giảm giá theo sản phẩm."],
        ui: "Không có UI.",
      }),
      labels: ["agent:build", "priority:high"],
      author: TL,
      created_at: at(8 * HOUR),
      updated_at: at(2 * HOUR + 40 * MIN),
      url: "https://github.com/org/shop/issues/36",
      state: "open",
      pull: null,
    },

    // ── blog ────────────────────────────────────────────────────────────────
    {
      slug: "blog",
      number: 8,
      title: "Trang tác giả",
      body: body({
        goal: "Mỗi tác giả có một trang gom bài đã viết.",
        acceptance: ["Given một tác giả, When mở /tac-gia/<slug>, Then thấy danh sách bài của họ."],
        constraints: ["Dùng lại layout danh sách bài đã có."],
        outOfScope: ["Không làm trang chỉnh sửa hồ sơ."],
        ui: "Figma: giống trang chuyên mục.",
      }),
      labels: ["status:ready-for-spec"],
      author: PM,
      created_at: at(HOUR),
      updated_at: at(HOUR),
      url: "https://github.com/org/blog/issues/8",
      state: "open",
      pull: null,
    },
    {
      slug: "blog",
      number: 9,
      title: "RSS trả về 500 khi bài không có ảnh bìa",
      body: body({
        goal: "RSS không đổ khi thiếu ảnh bìa.",
        acceptance: ["Given bài không có ảnh bìa, When gọi /rss.xml, Then trả 200 và bỏ qua thẻ ảnh."],
        constraints: ["Không đổi schema bài viết."],
        outOfScope: ["Không làm ảnh bìa mặc định."],
        ui: "Không có UI.",
      }),
      labels: ["needs-human", "priority:high"],
      author: TL,
      created_at: at(3 * 24 * HOUR),
      updated_at: at(26 * HOUR),
      url: "https://github.com/org/blog/issues/9",
      state: "open",
      pull: null,
    },
  ];

  const timeline: Record<string, GhComment[]> = {
    "myapp#38": [
      {
        id: 1001,
        author: ORCH,
        body:
          "<!-- agent-run -->\n**Độ rõ của spec: 4/5.**\n\nBốn mục đầu đủ và kiểm được. " +
          "Một chỗ còn mơ hồ: AC2 nói “bộ lọc vẫn giữ nguyên” sau khi tải lại — giữ ở " +
          "URL hay ở localStorage? Hai cách cho hành vi khác nhau khi người dùng gửi " +
          "link cho đồng nghiệp.",
        created_at: at(3 * HOUR + 20 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "myapp#40": [
      {
        id: 1002,
        author: ORCH,
        body:
          "<!-- agent-run -->\nĐã mở PR #45. Bốn AC đều có test E2E; bằng chứng ghi ở " +
          "`evidence/myapp/45/9f3c1ab/`.",
        created_at: at(2 * HOUR + 5 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "myapp#47": [
      {
        id: 1003,
        author: ORCH,
        body:
          "<!-- agent-run -->\nDừng sau 2 lần thử. Test `orders/detail.spec.ts` đỏ ở cả " +
          "hai lần với cùng lỗi lệch một ngày, nhưng sửa theo cách hiển nhiên thì làm " +
          "đỏ 6 test khác đang giả định giờ UTC. Đây là quyết định về sản phẩm chứ " +
          "không phải về code — cần người quyết.",
        created_at: at(6 * HOUR + 40 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "myapp#49": [
      {
        id: 1004,
        author: TL,
        body: "@claude cái audit log này ghi vào bảng nào cho đúng chuẩn hiện tại?",
        created_at: at(HOUR + 10 * MIN),
        kind: "issue",
        from_agent: false,
      },
      {
        id: 1005,
        author: ORCH,
        body:
          "<!-- agent-run -->\nTrong repo đang có hai chỗ ghi audit: `audit_events` " +
          "(bảng chung, có `actor_id`) và `order_events` (chỉ cho vòng đời đơn). Huỷ " +
          "đơn thuộc vòng đời đơn nhưng người thực hiện là khách, nên nó rơi vào giữa. " +
          "Anh muốn tôi ghi vào bảng nào?",
        created_at: at(50 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "shop#12": [
      {
        id: 1006,
        author: ORCH,
        body:
          "<!-- agent-run -->\n**Độ rõ của spec: 5/5.** Không có gì phải hỏi thêm; AC " +
          "viết thành test được ngay.",
        created_at: at(HOUR + 15 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "shop#30": [
      {
        id: 1007,
        author: ORCH,
        body: "<!-- agent-run -->\nĐã mở PR #37. Bằng chứng ở `evidence/shop/37/4b21d70/`.",
        created_at: at(5 * HOUR),
        kind: "issue",
        from_agent: true,
      },
      {
        id: 1008,
        author: TL,
        body: "Diff ổn. Đã approve trên GitHub, chờ PM duyệt nốt rồi tôi merge.",
        created_at: at(4 * HOUR),
        kind: "issue",
        from_agent: false,
      },
    ],
    "blog#9": [
      {
        id: 1009,
        author: ORCH,
        body:
          "<!-- agent-run -->\nKhông tái hiện được lỗi trên bản dựng sạch. Cần một bài " +
          "cụ thể gây lỗi để tiếp tục.",
        created_at: at(26 * HOUR),
        kind: "issue",
        from_agent: true,
      },
    ],
  };

  return {
    repos: [
      { slug: "blog", full: "org/blog" },
      { slug: "myapp", full: "org/myapp" },
      { slug: "shop", full: "org/shop" },
    ],
    tasks,
    timeline,
    nextIssueNumber: { myapp: 51, shop: 38, blog: 10 },
    nextCommentId: 2000,
  };
}
