---
description: Review every local change, write the message, and commit — never push
---

Commit whatever is currently uncommitted. I should be able to type `/commit` and
walk away.

## 1. Look at everything first

Read the actual diff, not just the file names — staged, unstaged and untracked.
You cannot describe a change you have not read.

Watch for things that should not be committed: secrets, `.env` values, debug
logging, a temporary config, a scratch file. `test-results/`,
`playwright-report/` and `.env*` are already gitignored; if something like that
turns up untracked anyway, leave it out and say so.

## 2. Check it builds before recording it

```bash
npm run tc && npx vitest run
```

If either fails, **stop and tell me** rather than committing. A broken commit is
worse than an uncommitted change — except when the failure is pre-existing and
unrelated to what changed, in which case say so plainly and carry on.

Run `npx prettier --write` over the files you are committing. The repo has many
pre-existing formatting violations; do not touch files outside this change.

## 3. One commit, or several

Default to **one**. Split only when the changes are genuinely unrelated — a
bugfix and an unconnected refactor, or code plus a change to what users read on
a page. Someone reviewing should be able to take one and leave the other.

Never split just to make the history look tidy.

## 4. Write the message

Follow the repo's convention: `type(scope): subject`, with type one of `feat`,
`fix`, `test`, `chore`, `docs`, `refactor`.

- **Subject** — under ~70 characters, imperative, says what changed and where.
  Not "update files". Not "various fixes".
- **Body** — short. Two or three sentences at most, and only when the subject
  cannot carry it alone. Say **why**, or what is non-obvious. Skip the body
  entirely for a change that explains itself.

Do not restate the diff in prose. If the reader can see it in the code, leave it
out.

End every message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## 5. Commit, and stop there

**Never push.** Not even when the branch is behind, not even when it looks
finished. Josh pushes after reading the commit.

If the current branch is `main`, do not commit onto it — say so and offer to
branch first.

Afterwards, show the one-line summary and the count of unpushed commits, and
give me the push command without running it:

```bash
git push origin <branch>
```
