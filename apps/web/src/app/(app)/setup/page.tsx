import { loadRepos, NewSessionForm } from "@/features/sessions";
import { DoctorChecklist, loadDoctor } from "@/features/setup";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

/**
 * Onboarding for a fresh machine (S4): the human steps in order, with the
 * machine's own doctor.json as live proof — configure on the machine,
 * verify and test from here. Command blocks are copy-paste ready.
 */

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`Step ${num}: ${title}`} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">
        <span className="font-mono text-muted-foreground">{num} · </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-2.5 font-mono text-xs leading-relaxed text-body">
      {children}
    </pre>
  );
}

export default async function SetupPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [doctor, repos] = await Promise.all([loadDoctor(), loadRepos()]);

  return (
    <>
      <PageHeader
        title="Setup"
        meta={
          <span className="font-mono text-xs text-muted-foreground">
            {doctor === null ? "machine not verified yet" : doctor.ok ? "machine ready" : "checks failing"}
          </span>
        }
      />
      <div className="flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
        <p className="text-sm text-body">
          bee runs your sessions on one dedicated machine. Five steps: install the runner,
          sign in, register repos, verify with doctor, then test a session right here.
          The machine stays PAUSED until every check is green and you remove the PAUSE file.
        </p>

        <Step num={1} title="Install the runner on the machine">
          <Cmd>{`git clone <this-repo> && cd bee-agent-flow
bash apps/runner/install.sh`}</Cmd>
          <p className="text-xs text-muted-foreground">
            Idempotent. Code goes to /opt/bee, data to /srv/bee, systemd user units are
            enabled, and a PAUSE file is created — nothing runs until you say so.
          </p>
        </Step>

        <Step num={2} title="Sign in on the machine — Claude and GitHub">
          <Cmd>{`loginctl enable-linger $USER   # sessions survive logout
claude                         # /login under this user
gh auth login                  # paste the fine-grained PAT
gh auth setup-git              # git clone/push through the PAT`}</Cmd>
          <p className="text-xs text-muted-foreground">
            The PAT must be fine-grained (github_pat_…): contents + pull requests + issues,
            scoped to exactly the repos you will register — nothing else. Doctor rejects
            full-account tokens.
          </p>
        </Step>

        <Step num={3} title="Register each repo and protect its main branch">
          <Cmd>{`echo 'REPO=owner/name' > /srv/bee/repos.d/<slug>.env`}</Cmd>
          <p className="text-xs text-muted-foreground">
            Then enable branch protection on main in GitHub settings — the agent must only
            reach main through a pull request you merge. Registered repos are the only ones
            sessions can open.
          </p>
          {repos.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">No repos registered yet.</p>
          ) : (
            <ul aria-label="Registered repos" className="flex flex-col gap-1 font-mono text-xs text-body">
              {repos.map((r) => (
                <li key={r.slug}>
                  {r.repo} <span className="text-muted-foreground">({r.slug})</span>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step num={4} title="Verify — the machine checks itself">
          <DoctorChecklist doctor={doctor} />
        </Step>

        <Step num={5} title="Un-pause and test with a real session">
          <Cmd>{`rm /srv/bee/PAUSE`}</Cmd>
          <p className="text-xs text-muted-foreground">
            Then start a session below — text should stream in within seconds. A chat
            session (no repo) is the safest first test: no tools, touches no code.
          </p>
          <NewSessionForm repos={repos} />
        </Step>
      </div>
    </>
  );
}
