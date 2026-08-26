import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { getActorWithToken } from "@/lib/auth/token";

import { ghGet, ghGraphQL, GithubError, ghSend } from "./api";
import {
  issueCuaPr,
  mapComment,
  mapGqlPull,
  mapGqlTask,
  mapTask,
  type ApiComment,
  type ApiIssue,
  type GqlIssue,
  type GqlPull,
} from "./map";
import { normalise, readRepos, writeRepos } from "./repos-store";
import type { Actor, GhComment, GhLabel, GhRepo, GhTask, GithubSource, NewTaskInput } from "./types";

/**
 * Bản gọi GitHub thật, bằng token của **người đang đăng nhập**.
 *
 * Không có token bot dùng chung: dấu vết kiểm toán chỉ đúng khi nó mang tên
 * người đã bấm, và chữ ký duyệt của PM chỉ có nghĩa khi GitHub tin rằng chính
 * PM đã ký. Đó cũng là lý do app không có nút merge — merge chỉ xảy ra trên
 * GitHub, do người làm.
 *
 * Mọi thao tác GHI nhận `Actor` qua tham số (server action đã có sẵn). Thao tác
 * ĐỌC thì tự lấy người đang đăng nhập, vì chữ ký của `GithubSource` không truyền
 * actor xuống — và đọc bằng token của người xem là đúng: ai không có quyền trên
 * repo thì không thấy repo đó, y như trên GitHub.
 */

/** Số issue/PR đọc về mỗi repo. Quá số này thì phân trang, xem `cacDuAn`. */
const MOI_TRANG = 100;

async function tokenCuaNguoiXem(): Promise<string | undefined> {
  return (await getActorWithToken())?.token;
}

/**
 * `listTasks()` gọi vài API cho mỗi repo, và một lần render dashboard chạm vào
 * nó nhiều lần. `cache()` của React gom chúng lại **trong cùng một request** —
 * đúng phạm vi cần, và tự hết hạn khi request kết thúc, nên một thao tác ghi
 * xong là lần đọc sau đã thấy dữ liệu mới.
 */
/**
 * GitHub từ chối token (401) là chuyện SẼ xảy ra: token OAuth bị thu hồi khi
 * người dùng gỡ quyền app, khi client secret được sinh lại, hoặc khi họ đăng
 * nhập lại ở nơi khác. Phiên trong cookie vẫn giải mã được — nên app vẫn tưởng
 * người dùng đã đăng nhập, và mọi trang đổ với một stack trace.
 *
 * Gặp thật: tạo task xong thì token còn tốt (issue được tạo), 40 phút sau mọi
 * trang 401. Người dùng không có cách nào đoán ra phải đăng xuất.
 *
 * Nên: ném người dùng về trang đăng nhập kèm dấu `expired`. Trang đó thấy dấu
 * này thì KHÔNG chuyển hướng ngược lại (phiên cũ vẫn còn nên nó sẽ lặp) mà hiện
 * nút đăng xuất — thứ duy nhất xoá được cookie hỏng.
 */
function neuTokenHong(e: unknown): never {
  if (e instanceof GithubError && e.status === 401) redirect("/login?expired=1");
  throw e;
}

const docTatCa = cache(async (): Promise<GhTask[]> => {
  try {
    const token = await tokenCuaNguoiXem();
    const repos = await readRepos();
    const theoRepo = await Promise.all(repos.map((r) => docRepo(token, r)));
    return theoRepo.flat();
  } catch (e) {
    neuTokenHong(e);
  }
});

/**
 * MỘT truy vấn cho cả repo: issue, PR, review, và trạng thái check.
 *
 * Đường REST cũ tốn `2 + 3 × số PR đang mở` lời gọi cho cùng màn hình này —
 * repo 20 PR là 62 lời gọi, mỗi lần tải trang, và hạn mức REST là 5.000/giờ.
 * Truy vấn dưới đây tốn **1 điểm** trong hạn mức 5.000 điểm/giờ (đo thật trên
 * api.github.com). Đó là khác biệt giữa "dùng được cả ngày" và "cạn hạn mức
 * lúc 3 giờ chiều".
 *
 * `orderBy: UPDATED_AT` chứ không phải mặc định: khi repo vượt 100 issue, 100
 * cái ĐỘNG GẦN NHẤT mới là 100 cái đáng lấy — không phải 100 cái mới tạo.
 */
const TRUY_VAN = `
query($owner:String!, $name:String!, $n:Int!) {
  repository(owner:$owner, name:$name) {
    issues(first:$n, orderBy:{field:UPDATED_AT, direction:DESC}) {
      nodes {
        number title body url state createdAt updatedAt
        author { login avatarUrl }
        labels(first:20) { nodes { name } }
      }
    }
    pullRequests(first:$n, states:[OPEN], orderBy:{field:UPDATED_AT, direction:DESC}) {
      nodes {
        number title body url isDraft headRefOid
        reviews(last:20) { nodes { state submittedAt author { login avatarUrl } } }
        commits(last:1) { nodes { commit { statusCheckRollup { contexts(first:50) { nodes {
          __typename
          ... on StatusContext { context state }
          ... on CheckRun { name status conclusion }
        } } } } } }
      }
    }
  }
}`;

interface TraLoi {
  repository: {
    issues: { nodes: GqlIssue[] };
    pullRequests: { nodes: GqlPull[] };
  } | null;
}

async function docRepo(token: string | undefined, repo: GhRepo): Promise<GhTask[]> {
  if (!token) {
    // Nói ra ở đây thay vì để `ghGraphQL` ném một câu chung chung: thiếu token
    // là lỗi CẤU HÌNH (OAuth app thiếu scope `repo`, hoặc phiên cũ chưa mang
    // access_token), không phải lỗi mạng, và nó cần một hành động khác hẳn.
    throw new Error(
      "No GitHub token for the signed-in user. Sign out and back in — the OAuth app must request the `repo` scope.",
    );
  }
  const [owner, name] = repo.full.split("/");
  const data = await ghGraphQL<TraLoi>(token, TRUY_VAN, { owner, name, n: MOI_TRANG });
  if (!data.repository) return [];

  // PR ↔ issue qua từ khoá đóng trong body. Một PR không tham chiếu issue nào
  // vẫn là việc đang diễn ra, nên nó được giữ lại như một task riêng — bỏ nó đi
  // là giấu mất công việc thật.
  const theoIssue = new Map<number, GqlPull>();
  const roiRac: GqlPull[] = [];
  for (const p of data.repository.pullRequests.nodes) {
    const n = issueCuaPr(p.body);
    if (n !== null && !theoIssue.has(n)) theoIssue.set(n, p);
    else if (n === null) roiRac.push(p);
  }

  // `issues` của GraphQL KHÔNG lẫn pull request — khác hẳn `GET /issues` của
  // REST, nơi mỗi PR hiện thêm một lần như một task riêng. Không cần lọc.
  const tasks = data.repository.issues.nodes.map((i) => {
    const p = theoIssue.get(typeof i.number === "number" ? i.number : -1);
    return mapGqlTask(repo.slug, i, p ? mapGqlPull(p) : null);
  });

  const themVao = roiRac.map((p) =>
    mapGqlTask(
      repo.slug,
      { number: p.number, title: p.title, body: p.body, url: p.url, state: "OPEN" },
      mapGqlPull(p),
    ),
  );

  return [...tasks, ...themVao];
}

/**
 * Ném lỗi rõ ràng thay vì trả dữ liệu rỗng: một app im lặng hiện hộp thư trống
 * vì cấu hình sai trông y hệt một hộp thư trống vì không có việc, mà hai chuyện
 * đó cách nhau rất xa.
 */
function repoCua(repos: GhRepo[], slug: string): GhRepo {
  const r = repos.find((x) => x.slug === slug);
  if (!r) throw new Error(`Project ${slug} is not on this dashboard. Add it first.`);
  return r;
}

/** Đọc lại task sau khi ghi — mọi thao tác ghi trả về trạng thái MỚI. */
async function docLai(slug: string, num: number): Promise<GhTask> {
  const t = (await docTatCa()).find((x) => x.slug === slug && x.number === num);
  if (t) return t;
  throw new Error(`Task ${slug}#${num} disappeared right after the write succeeded.`);
}

export function createLiveGithubSource(): GithubSource {
  return {
    async listRepos(): Promise<GhRepo[]> {
      return readRepos();
    },

    async addRepo(full: string, actor: Actor): Promise<GhRepo> {
      const { full: sach, slug } = normalise(full);
      const repos = await readRepos();
      if (repos.some((r) => r.slug === slug)) {
        throw new Error(`A project named ${slug} already exists.`);
      }

      // Kiểm bằng token của NGƯỜI BẤM trước khi ghi vào danh sách. Thêm được
      // một repo mình không đọc nổi thì thẻ dự án sẽ mãi mãi báo lỗi, và không
      // ai đoán được là vì quyền.
      await ghGet<unknown>(actor.token, `/repos/${sach}`);

      const repo: GhRepo = { slug, full: sach };
      await writeRepos([...repos, repo].sort((a, b) => a.slug.localeCompare(b.slug)));
      return repo;
    },

    listTasks: () => docTatCa(),

    async getTask(slug, num): Promise<GhTask | null> {
      return (await docTatCa()).find((t) => t.slug === slug && t.number === num) ?? null;
    },

    async listTimeline(slug, num): Promise<GhComment[]> {
      const token = await tokenCuaNguoiXem();
      const repo = repoCua(await readRepos(), slug);
      const task = await this.getTask(slug, num);

      const [issueCmts, reviewCmts] = await Promise.all([
        ghGet<ApiComment[]>(token, `/repos/${repo.full}/issues/${num}/comments?per_page=${MOI_TRANG}`),
        // Comment trên diff nằm ở PR, không ở issue — hai số khác nhau. Không
        // có PR thì không có gì để lấy, và hỏi số của issue sẽ trả về 404.
        task?.pull
          ? ghGet<ApiComment[]>(
              token,
              `/repos/${repo.full}/pulls/${String(task.pull.number)}/comments?per_page=${MOI_TRANG}`,
            ).catch(() => [])
          : Promise.resolve<ApiComment[]>([]),
      ]);

      return [
        ...issueCmts.map((c) => mapComment(c, "issue")),
        ...reviewCmts.map((c) => mapComment(c, "review")),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async createTask(input: NewTaskInput, actor: Actor): Promise<GhTask> {
      const repo = repoCua(await readRepos(), input.slug);
      const body = [
        "### Goal",
        "",
        input.goal,
        "",
        "### Acceptance Criteria",
        "",
        input.acceptance,
        "",
        "### Technical constraints",
        "",
        input.constraints,
        "",
        "### Out of scope",
        "",
        input.out_of_scope,
        "",
        "### UI Reference",
        "",
        input.ui_reference,
      ].join("\n");

      // Tạo từ app thì bỏ qua `status:draft` — form đã ép đủ năm mục, nên nó
      // sẵn sàng cho rule 08 chấm ngay ở tick sau.
      const issue = await ghSend<ApiIssue>(actor.token, "POST", `/repos/${repo.full}/issues`, {
        title: input.title,
        body,
        labels: ["status:ready-for-spec"],
      });
      return mapTask(input.slug, issue, null);
    },

    async addComment(slug, num, body, actor): Promise<GhComment> {
      const repo = repoCua(await readRepos(), slug);
      const c = await ghSend<ApiComment>(
        actor.token,
        "POST",
        `/repos/${repo.full}/issues/${num}/comments`,
        { body },
      );
      return mapComment(c, "issue");
    },

    async addLabel(slug, num, label: GhLabel, actor): Promise<GhTask> {
      const repo = repoCua(await readRepos(), slug);
      await ghSend<unknown>(actor.token, "POST", `/repos/${repo.full}/issues/${num}/labels`, {
        labels: [label],
      });
      return docLai(slug, num);
    },

    async removeLabel(slug, num, label: GhLabel, actor): Promise<GhTask> {
      const repo = repoCua(await readRepos(), slug);
      try {
        await ghSend<unknown>(
          actor.token,
          "DELETE",
          `/repos/${repo.full}/issues/${num}/labels/${encodeURIComponent(label)}`,
        );
      } catch (e) {
        // Nhãn đã không còn ở đó là kết quả người dùng muốn. GitHub trả 404 cho
        // trường hợp này, và làm đổ cả thao tác vì nó là báo lỗi cho một việc
        // đã xong.
        if ((e as { status?: number }).status !== 404) throw e;
      }
      return docLai(slug, num);
    },

    /** Approve PR. **Không có merge** — merge chỉ xảy ra trên GitHub, do người làm. */
    async approve(slug, num, actor): Promise<GhTask> {
      const repo = repoCua(await readRepos(), slug);
      const task = await this.getTask(slug, num);
      if (!task?.pull) throw new Error(`${slug}#${num} has no PR to approve.`);

      await ghSend<unknown>(
        actor.token,
        "POST",
        `/repos/${repo.full}/pulls/${String(task.pull.number)}/reviews`,
        { event: "APPROVE" },
      );
      return docLai(slug, num);
    },
  };
}
