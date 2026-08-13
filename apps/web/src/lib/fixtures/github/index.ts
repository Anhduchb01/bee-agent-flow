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
    "### Goal",
    "",
    parts.goal,
    "",
    "### Acceptance Criteria",
    "",
    ...parts.acceptance.map((a) => `- [ ] ${a}`),
    "",
    "### Technical constraints",
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
      title: "Add a status filter to the orders list",
      body: body({
        goal: "An operator can filter orders by status to find the ones needing action without scrolling the whole page.",
        acceptance: [
          "Given the orders list, When I pick the status “Pending”, Then only orders in that status show.",
          "Given a filter is applied, When I reload the page, Then the filter is still applied.",
        ],
        constraints: [
          "Touch the orders module only; do not modify the payments module.",
          "Keep the response shape of GET /orders — the mobile client depends on it.",
        ],
        outOfScope: ["No pagination (that gets its own issue).", "No refactor of the existing table."],
        ui: "Figma: the filter block sits right above the table, as chips.",
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
      title: "Filter orders by status",
      body: body({
        goal: "The build of #38 — PR and evidence exist.",
        acceptance: [
          "Given the orders list, When I pick a status, Then only matching orders show.",
          "Given a filter is applied, When I reload the page, Then the filter is still applied.",
        ],
        constraints: ["Touch the orders module only."],
        outOfScope: ["No pagination."],
        ui: "Same as #38.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: PM,
      created_at: at(28 * HOUR),
      updated_at: at(2 * HOUR + 5 * MIN),
      url: "https://github.com/org/myapp/issues/40",
      state: "open",
      pull: {
        number: 45,
        title: "feat(orders): filter by status",
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
      title: "Combine the two notification settings screens",
      body: body({
        goal: "A user changes every notification setting in one place.",
        acceptance: ["Given the settings page, When it opens, Then both email and push appear in one form."],
        constraints: ["Do not change the notification_settings schema."],
        outOfScope: ["No Slack channel."],
        ui: "No new UI, just merging two existing pages.",
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
      title: "Add a notification settings page",
      body: body({
        goal: "A user turns each notification type on or off.",
        acceptance: ["Given the settings page, When I turn a type off, Then I stop receiving that type."],
        constraints: ["Reuse the existing form component."],
        outOfScope: ["No mobile push notifications."],
        ui: "Figma: a list of toggles.",
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
      title: "Export the list to CSV",
      body: body({
        goal: "An operator downloads the filtered list as CSV to send to accounting.",
        acceptance: ["Given a filtered list, When I hit Export, Then the CSV has exactly the rows on screen."],
        constraints: ["Do not load the whole table into memory."],
        outOfScope: ["No XLSX export."],
        ui: "An Export button next to the filter block.",
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
      title: "Fix the date shown on the order detail screen",
      body: body({
        goal: "Dates render in the Vietnam time zone.",
        acceptance: ["Given an order created at 23:30 VN time, When I open its detail, Then it shows that same day."],
        constraints: ["Do not change how it is stored in the DB (still UTC)."],
        outOfScope: ["No per-user time zone setting."],
        ui: "No new UI.",
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
      title: "Allow cancelling an order within the first 15 minutes",
      body: body({
        goal: "A customer cancels a fresh order themselves without calling support.",
        acceptance: ["Given an order placed under 15 minutes ago, When I hit Cancel, Then it moves to cancelled."],
        constraints: ["Every cancellation must be written to the audit log."],
        outOfScope: ["No automatic refunds."],
        ui: "A Cancel button on the order detail page.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: TL,
      created_at: at(30 * HOUR),
      updated_at: at(50 * MIN),
      url: "https://github.com/org/myapp/issues/49",
      state: "open",
      pull: {
        number: 52,
        title: "feat(orders): cancel within 15 minutes",
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
      title: "Change the invoice numbering scheme",
      body: body({
        goal: "Invoice numbers follow the format accounting asked for.",
        acceptance: ["Given a new invoice, When it is created, Then its number looks like HD-YYYY-NNNN."],
        constraints: ["Do not touch existing invoices."],
        outOfScope: ["No e-invoice export."],
        ui: "No UI.",
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
      title: "Show a product's price history",
      body: body({
        goal: "A customer sees how the price moved over 90 days.",
        acceptance: ["Given a product page, When I open the Price history tab, Then I see a 90-day chart."],
        constraints: ["Read from the existing price_history table."],
        outOfScope: ["No price-drop alerts."],
        ui: "Figma: the third tab on the product page.",
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
      title: "Regional tax calculation",
      body: body({
        goal: "Orders apply the right tax for the delivery province.",
        acceptance: ["Given a delivery address in a province with its own tax, When I place the order, Then the total applies that tax."],
        constraints: ["Load the tax table from a config file, do not hardcode it."],
        outOfScope: ["No international tax."],
        ui: "No new UI, only the numbers at checkout change.",
      }),
      labels: ["agent:build", "agent:eligible", "agent:built"],
      author: TL,
      created_at: at(2 * 24 * HOUR),
      updated_at: at(4 * HOUR + 30 * MIN),
      url: "https://github.com/org/shop/issues/30",
      state: "open",
      pull: {
        number: 37,
        title: "feat(checkout): regional tax",
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
      title: "Rework the checkout flow",
      body: "### Goal\n\nStill drafting.",
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
      title: "Fix tax on orders with a discount code",
      body: body({
        goal: "Tax applies to the amount after the discount.",
        acceptance: ["Given an order with a 10% discount code, When tax is computed, Then it applies to the discounted amount."],
        constraints: ["Do not change how discount codes are stored."],
        outOfScope: ["No per-product discount codes."],
        ui: "No UI.",
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
      title: "Author pages",
      body: body({
        goal: "Each author gets a page collecting what they wrote.",
        acceptance: ["Given an author, When I open /authors/<slug>, Then I see the list of their posts."],
        constraints: ["Reuse the existing post-list layout."],
        outOfScope: ["No profile editing page."],
        ui: "Figma: same as the category page.",
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
      title: "RSS returns 500 when a post has no cover image",
      body: body({
        goal: "RSS does not fall over when a cover image is missing.",
        acceptance: ["Given a post with no cover image, When /rss.xml is called, Then it returns 200 and skips the image tag."],
        constraints: ["Do not change the post schema."],
        outOfScope: ["No default cover image."],
        ui: "No UI.",
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
          "<!-- agent-run -->\n**Spec clarity: 4/5.**\n\nThe first four sections are complete and " +
          "checkable. One thing stays ambiguous: AC2 says the filter “is still applied” after " +
          "a reload — kept in the URL or in localStorage? The two choices behave differently " +
          "when someone sends the link to a colleague.",
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
          "<!-- agent-run -->\nOpened PR #45. All four AC have E2E tests; evidence written to " +
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
          "<!-- agent-run -->\nStopped after 2 attempts. `orders/detail.spec.ts` was red both " +
          "times with the same off-by-one-day failure, but the obvious fix turns 6 other " +
          "tests red — they assume UTC. This is a product decision, not a code one — it " +
          "needs a human.",
        created_at: at(6 * HOUR + 40 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "myapp#49": [
      {
        id: 1004,
        author: TL,
        body: "@claude which table should this audit log be written to, to match what we do today?",
        created_at: at(HOUR + 10 * MIN),
        kind: "issue",
        from_agent: false,
      },
      {
        id: 1005,
        author: ORCH,
        body:
          "<!-- agent-run -->\nThe repo writes audit records in two places: `audit_events` " +
          "(the shared table, with `actor_id`) and `order_events` (order lifecycle only). " +
          "Cancellation belongs to the order lifecycle, but the actor is a customer, so it " +
          "falls between the two. Which one should I write to?",
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
          "<!-- agent-run -->\n**Spec clarity: 5/5.** Nothing to ask; the AC translate straight " +
          "into tests.",
        created_at: at(HOUR + 15 * MIN),
        kind: "issue",
        from_agent: true,
      },
    ],
    "shop#30": [
      {
        id: 1007,
        author: ORCH,
        body: "<!-- agent-run -->\nOpened PR #37. Evidence in `evidence/shop/37/4b21d70/`.",
        created_at: at(5 * HOUR),
        kind: "issue",
        from_agent: true,
      },
      {
        id: 1008,
        author: TL,
        body: "Diff looks fine. Approved on GitHub — waiting on the PM, then I will merge.",
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
          "<!-- agent-run -->\nCould not reproduce the failure on a clean build. I need a " +
          "specific post that triggers it to continue.",
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
