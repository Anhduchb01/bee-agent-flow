---
description: Implement the agreed task test-first — one slice at a time, each with its own passing test and commit
---

Implement the task agreed in THIS conversation, in the current worktree.

Work test-first, and in slices small enough that each one lands on its own:

1. Write the test that fails for the behaviour you are about to add. Run it
   and SEE it fail — a test that passes the moment you write it is not
   testing what you think.
2. Write the least code that makes it pass.
3. Run the whole suite, not just your test. A green slice that broke
   something else is not green.
4. Commit that slice, with a message saying WHY, not what the diff shows.

Then take the next slice. Do not stack three slices and one commit: the point
of the small ones is that any of them is a clean place to stop.

Discover this repo's own commands before running anything — the test runner,
the linter, the typechecker. Never assume `npm test`; a Gradle, Cargo or
pytest repo has its own, and CI is the honest place to read them from.

Stop and say so, rather than pushing through, when:
- a test cannot be made to pass without changing what the task means
- the task turns out to need a decision nobody has made yet
- the change is one `git revert` cannot undo — deletions, migrations,
  anything touching secrets or money

$ARGUMENTS — optional: which slice to start with, or a constraint to respect.
