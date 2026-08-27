---
description: Review this branch's diff before it becomes a PR — correctness, then everything else
---

Review the diff of the current worktree against its base branch. Read the
actual diff first (`git diff $(git merge-base HEAD origin/HEAD)...HEAD`), not
your memory of writing it.

Go in this order, because the axes are not equally important:

1. **Correctness.** For each finding, name the input or state that produces
   the wrong output. A concern you cannot turn into "given X, this returns Y
   and should return Z" is a hunch — say it is one, or drop it.
2. **Silent failure.** This codebase's recurring bug is not a crash, it is
   something that keeps working and stops being true: a cap that does not
   bite, a check that reads empty and reports green, a registry key that
   drifted from the string it must match. Hunt for those specifically.
3. **Tests.** Does a test exist that would have caught each change if it were
   wrong? A test that passes against both the old and new code proves nothing.
4. **Reuse and simplification.** Something here may already exist elsewhere in
   the repo. Say where.

Report findings most-severe first, with file and line. If nothing real
survives that bar, say the diff looks sound — an invented finding costs more
than an empty review, because it teaches the reader to skim the next one.

Do not fix anything unless asked. A review that rewrites the code cannot be
disagreed with.

$ARGUMENTS — optional: a path to focus on, or an axis to weight.
