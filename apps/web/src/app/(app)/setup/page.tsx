import { loadRepos, NewSessionForm } from "@/features/sessions";
import {
  ClaudeSetup,
  DoctorChecklist,
  LingerButton,
  loadClaudeAuth,
  loadEnvFiles,
  loadDoctor,
  PatForm,
  PauseToggle,
  RepoRegistry,
} from "@/features/setup";
import { PageHeader } from "@/features/shell";
import { getActor } from "@/lib/auth";

/**
 * Onboarding for a fresh machine (S4). Only ONE thing stays on the machine
 * itself: running install.sh (it bootstraps this very web app). Everything
 * else — linger, Claude token (`claude setup-token` runs on any machine),
 * GitHub PAT, repo registry, un-pause — is a button or form HERE, and
 * every action ends with a fresh doctor run so the page always shows
 * verified truth.
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

function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">{children}</div>;
}

export default async function SetupPage() {
  const actor = await getActor();
  if (!actor) return null;

  const [doctor, repos, claudeAuth] = await Promise.all([
    loadDoctor(),
    loadRepos(),
    loadClaudeAuth(),
  ]);
  const envFiles = await loadEnvFiles(repos.map((r) => r.slug));

  const check = (id: string): boolean | null =>
    doctor?.checks.find((c) => c.id === id)?.ok ?? null;
  const protection = Object.fromEntries(
    repos.map((r) => [r.slug, doctor?.checks.find((c) => c.id === `repo:${r.slug}`)?.ok]),
  );

  // On fixture data every button is a no-op and doctor is staged — saying
  // so loudly is the difference between a demo and a lie. One real user
  // already "finished setup" against this page in fixture mode.
  const laFixture = process.env.BEE_SOURCE !== "disk";

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
      {laFixture && (
        <p className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-xs text-amber-500 sm:px-6">
          DEMO DATA — this page is showing fixture scenes, not a real machine. Buttons here do
          nothing. Real setup happens on the installed machine&apos;s web (BEE_SOURCE=disk).
        </p>
      )}
      <div className="flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
        <p className="text-sm text-body">
          bee runs your sessions on one dedicated machine. Install the runner there once;
          configure and verify everything else on this page. The machine stays PAUSED until
          every check is green and you flip it live below.
        </p>

        <Step num={1} title="Install the runner on the machine">
          <Cmd>{`git clone <this-repo> && cd bee-agent-flow
bash apps/runner/install.sh`}</Cmd>
          <p className="text-xs text-muted-foreground">
            The ONLY step that happens on the machine — it bootstraps everything,
            including this web app. Idempotent: code to /opt/bee, data to /srv/bee,
            user units enabled, PAUSE created. Every step after this one lives on
            this page.
          </p>
        </Step>

        <Step num={2} title="Sign in — Claude and GitHub, both from here">
          <Card>
            <LingerButton done={check("linger")} />
          </Card>
          <Card>
            <ClaudeSetup auth={claudeAuth} />
          </Card>
          <Card>
            <PatForm done={check("pat")} />
            <p className="text-xs text-muted-foreground">
              Create a fine-grained PAT scoped to exactly the repos you will register, with
              contents + pull requests + issues — nothing else. Saved straight into the
              machine&apos;s gh; never stored by the web app.
            </p>
          </Card>
        </Step>

        <Step num={3} title="Register repos and protect their main branches">
          <Card>
            <RepoRegistry repos={repos} protection={protection} envFiles={envFiles} />
          </Card>
        </Step>

        <Step num={4} title="Verify — the machine checks itself">
          <DoctorChecklist doctor={doctor} />
        </Step>

        <Step num={5} title="Go live and test with a real session">
          <Card>
            <PauseToggle paused={doctor?.paused ?? true} ready={doctor?.ok === true} />
          </Card>
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
