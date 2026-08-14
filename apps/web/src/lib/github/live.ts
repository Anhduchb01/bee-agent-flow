import "server-only";

import { cache } from "react";

import { getActorWithToken } from "@/lib/auth/token";

import { ghGet, ghSend } from "./api";
import {
  issueCuaPr,
  laPullRequest,
  mapChecks,
  mapComment,
  mapPull,
  mapReviews,
  mapTask,
  type ApiComment,
  type ApiIssue,
  type ApiPull,
} from "./map";
import { chuanHoa, docRepos, ghiRepos } from "./repos-store";
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
const docTatCa = cache(async (): Promise<GhTask[]> => {
  const token = await tokenCuaNguoiXem();
  const repos = await docRepos();
  const theoRepo = await Promise.all(repos.map((r) => docRepo(token, r)));
  return theoRepo.flat();
});

async function docRepo(token: string | undefined, repo: GhRepo): Promise<GhTask[]> {
  const [issues, pulls] = await Promise.all([
    ghGet<ApiIssue[]>(token, `/repos/${repo.full}/issues?state=all&per_page=${MOI_TRANG}`),
    ghGet<ApiPull[]>(token, `/repos/${repo.full}/pulls?state=open&per_page=${MOI_TRANG}`),
  ]);

  // PR ↔ issue. Một PR không tham chiếu issue nào vẫn là việc đang diễn ra, nên
  // nó được giữ lại như một task riêng — bỏ nó đi là giấu mất công việc thật.
  const theoIssue = new Map<number, ApiPull>();
  const roiRac: ApiPull[] = [];
  for (const p of pulls) {
    const n = issueCuaPr(p.body);
    if (n !== null && !theoIssue.has(n)) theoIssue.set(n, p);
    else if (n === null) roiRac.push(p);
  }

  const dayDu = async (p: ApiPull) => {
    const sha = String(p.head?.sha ?? "");
    const [statuses, checkRuns, reviews] = await Promise.all([
      ghGet<unknown>(token, `/repos/${repo.full}/commits/${sha}/status`).catch(() => null),
      ghGet<unknown>(token, `/repos/${repo.full}/commits/${sha}/check-runs`).catch(() => null),
      ghGet<unknown>(token, `/repos/${repo.full}/pulls/${String(p.number)}/reviews`).catch(
        () => [],
      ),
    ]);
    return mapPull(p, mapChecks(statuses, checkRuns), mapReviews(reviews));
  };

  const dayDuTheoIssue = new Map<number, Awaited<ReturnType<typeof dayDu>>>();
  await Promise.all(
    [...theoIssue].map(async ([n, p]) => {
      dayDuTheoIssue.set(n, await dayDu(p));
    }),
  );

  const tasks = issues
    .filter((i) => !laPullRequest(i))
    .map((i) => mapTask(repo.slug, i, dayDuTheoIssue.get(Number(i.number ?? 0)) ?? null));

  // PR không gắn issue: dựng một task từ chính nó, để nó vẫn hiện trên bảng.
  const themVao = await Promise.all(
    roiRac.map(async (p) => {
      const pull = await dayDu(p);
      return mapTask(
        repo.slug,
        {
          number: p.number,
          title: p.title,
          body: p.body,
          labels: [],
          html_url: p.html_url,
          state: "open",
        },
        pull,
      );
    }),
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
      return docRepos();
    },

    async addRepo(full: string, actor: Actor): Promise<GhRepo> {
      const { full: sach, slug } = chuanHoa(full);
      const repos = await docRepos();
      if (repos.some((r) => r.slug === slug)) {
        throw new Error(`A project named ${slug} already exists.`);
      }

      // Kiểm bằng token của NGƯỜI BẤM trước khi ghi vào danh sách. Thêm được
      // một repo mình không đọc nổi thì thẻ dự án sẽ mãi mãi báo lỗi, và không
      // ai đoán được là vì quyền.
      await ghGet<unknown>(actor.token, `/repos/${sach}`);

      const repo: GhRepo = { slug, full: sach };
      await ghiRepos([...repos, repo].sort((a, b) => a.slug.localeCompare(b.slug)));
      return repo;
    },

    listTasks: () => docTatCa(),

    async getTask(slug, num): Promise<GhTask | null> {
      return (await docTatCa()).find((t) => t.slug === slug && t.number === num) ?? null;
    },

    async listTimeline(slug, num): Promise<GhComment[]> {
      const token = await tokenCuaNguoiXem();
      const repo = repoCua(await docRepos(), slug);
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
      const repo = repoCua(await docRepos(), input.slug);
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
      const repo = repoCua(await docRepos(), slug);
      const c = await ghSend<ApiComment>(
        actor.token,
        "POST",
        `/repos/${repo.full}/issues/${num}/comments`,
        { body },
      );
      return mapComment(c, "issue");
    },

    async addLabel(slug, num, label: GhLabel, actor): Promise<GhTask> {
      const repo = repoCua(await docRepos(), slug);
      await ghSend<unknown>(actor.token, "POST", `/repos/${repo.full}/issues/${num}/labels`, {
        labels: [label],
      });
      return docLai(slug, num);
    },

    async removeLabel(slug, num, label: GhLabel, actor): Promise<GhTask> {
      const repo = repoCua(await docRepos(), slug);
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
      const repo = repoCua(await docRepos(), slug);
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
