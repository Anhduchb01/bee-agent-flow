import "server-only";

import { seedGithub, type GithubSeed } from "@/lib/fixtures/github";

import type {
  Actor,
  GhComment,
  GhLabel,
  GhRepo,
  GhTask,
  GithubSource,
  NewTaskInput,
} from "./types";

/**
 * Bản GitHub chạy trong bộ nhớ. Ghi vào đây là ghi thật — tạo task, comment,
 * gắn nhãn, approve đều đổi state và hiện ra ở lần đọc sau.
 *
 * Store treo trên `globalThis` vì Next dựng lại module mỗi lần HMR; giữ ở biến
 * module thì mọi thao tác của người dùng biến mất khi sửa một file CSS, và đó
 * là kiểu "lỗi" tốn nửa buổi để phát hiện ra là không phải lỗi.
 */
const KEY = Symbol.for("bee.github.fixture");

type Store = GithubSeed;

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  if (!g[KEY]) g[KEY] = seedGithub();
  return g[KEY];
}

/** Chỉ dành cho test. */
export function resetGithubFixture(base?: Date): void {
  (globalThis as unknown as Record<symbol, Store | undefined>)[KEY] = seedGithub(base);
}

const clone = <T,>(v: T): T => structuredClone(v);

function find(s: Store, slug: string, num: number): GhTask | undefined {
  return s.tasks.find((t) => t.slug === slug && t.number === num);
}

function touch(task: GhTask): void {
  task.updated_at = new Date().toISOString();
}

export function createFixtureGithubSource(): GithubSource {
  return {
    async listRepos(): Promise<GhRepo[]> {
      return clone(store().repos);
    },

    async listTasks(): Promise<GhTask[]> {
      return clone(store().tasks);
    },

    async getTask(slug, num): Promise<GhTask | null> {
      const t = find(store(), slug, num);
      return t ? clone(t) : null;
    },

    async listTimeline(slug, num): Promise<GhComment[]> {
      const list = store().timeline[`${slug}#${num}`] ?? [];
      return clone(list).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async createTask(input: NewTaskInput, actor: Actor): Promise<GhTask> {
      const s = store();
      const num = s.nextIssueNumber[input.slug] ?? 1;
      s.nextIssueNumber[input.slug] = num + 1;

      const full = s.repos.find((r) => r.slug === input.slug)?.full ?? `org/${input.slug}`;
      const now = new Date().toISOString();
      const task: GhTask = {
        slug: input.slug,
        number: num,
        title: input.title,
        body: [
          "### Mục tiêu",
          "",
          input.goal,
          "",
          "### Acceptance Criteria",
          "",
          input.acceptance,
          "",
          "### Ràng buộc kỹ thuật",
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
        ].join("\n"),
        // Tạo từ app thì bỏ qua `status:draft` — form đã ép đủ năm mục, nên nó
        // sẵn sàng cho rule 08 chấm ngay ở tick sau.
        labels: ["status:ready-for-spec"],
        author: { login: actor.login, name: actor.name, avatar_url: actor.avatar_url },
        created_at: now,
        updated_at: now,
        url: `https://github.com/${full}/issues/${num}`,
        state: "open",
        pull: null,
      };
      s.tasks.push(task);
      return clone(task);
    },

    async addComment(slug, num, body, actor): Promise<GhComment> {
      const s = store();
      const key = `${slug}#${num}`;
      const comment: GhComment = {
        id: s.nextCommentId++,
        author: { login: actor.login, name: actor.name, avatar_url: actor.avatar_url },
        body,
        created_at: new Date().toISOString(),
        kind: "issue",
        from_agent: false,
      };
      (s.timeline[key] ??= []).push(comment);
      const task = find(s, slug, num);
      if (task) touch(task);
      return clone(comment);
    },

    async addLabel(slug, num, label: GhLabel): Promise<GhTask> {
      const s = store();
      const task = find(s, slug, num);
      if (!task) throw new Error(`không có task ${slug}#${num}`);
      if (!task.labels.includes(label)) task.labels.push(label);
      touch(task);
      return clone(task);
    },

    async removeLabel(slug, num, label: GhLabel): Promise<GhTask> {
      const s = store();
      const task = find(s, slug, num);
      if (!task) throw new Error(`không có task ${slug}#${num}`);
      task.labels = task.labels.filter((l) => l !== label);
      touch(task);
      return clone(task);
    },

    async approve(slug, num, actor): Promise<GhTask> {
      const s = store();
      const task = find(s, slug, num);
      if (!task) throw new Error(`không có task ${slug}#${num}`);
      if (!task.pull) throw new Error(`${slug}#${num} chưa có PR để duyệt`);

      task.pull.reviews = [
        ...task.pull.reviews.filter((r) => r.author.login !== actor.login),
        {
          author: { login: actor.login, name: actor.name, avatar_url: actor.avatar_url },
          state: "APPROVED",
          submitted_at: new Date().toISOString(),
        },
      ];
      touch(task);
      return clone(task);
    },
  };
}
