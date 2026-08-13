import { PageTitle } from "@/components/page-title";
import { TaskForm } from "@/features/task-new";
import { getActor } from "@/lib/auth";
import { getGithub } from "@/lib/github";

export default async function TaskMoiPage() {
  const actor = await getActor();
  if (!actor) return null;

  const repos = await getGithub().listRepos();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <PageTitle
        title="Task mới"
        hint="Năm mục dưới đây đều bắt buộc. Điền đủ ngay từ đầu rẻ hơn một vòng hỏi ngược."
      />
      <TaskForm repos={repos} />
    </main>
  );
}
