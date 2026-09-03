---
description: Write the release notes for a PR and regenerate the bundled changelog
argument-hint: <PR number>
---

Write the release notes for PR
https://github.com/joshbleacherrentals/br_driver/pull/$1

Read the **whole** PR — every commit and every changed file, not just the
description — then:

1. **Pick the new version.** Look at `versions/` and increment from the newest
   file in proportion to what this PR actually contains (patch for fixes, minor
   for new features, major for breaking changes). This is also the App Store
   version — `versions/` is the single source of truth for version history, and
   `package.json` must match its newest entry exactly.
2. **Create `versions/<new-version>.md`**, starting with the release date:

   ```
   ---
   date: YYYY-MM-DD
   ---

   ### 🚚 What changed
   ```

3. **Bump `"version"` in `package.json` to the same `<new-version>`.** CI
   (`scripts/changelog/checkChangelog.cli.ts`) requires exactly one new version
   file per PR, newer than anything on the target branch, with a valid date and
   a real body — *and* rejects the PR if `package.json` doesn't match it
   exactly.

4. **Run `npm run changelog:generate`** and commit
   `features/changelog/generated/versions.ts`. That file is what ships in the
   bundle — the `.md` alone never reaches the phone, and CI fails if it is stale.

## Who is reading this

**Drivers.** Not technical, usually on a phone, often mid-shift. They care about
what they tap, where it is, and what is different from yesterday.

## How to write it

- **Short and to the point.** Only what a driver will notice. Leave out
  refactors, dependency bumps and internal plumbing.
- **Be specific about location** — name the screen, the tab, the button. "The
  camera button on the damage report screen", not "improved damage reports".
- Lead with what changed for the driver, not with how it was built.
- Match the tone and structure of the most recent file in `versions/`.
- Supported markdown is limited (see `features/changelog/util/parseMarkdown.ts`):
  `###` headings, paragraphs, `-` bullets, `**bold**`, `*italic*`, `` `code` ``.
  No images, no HTML, and links render as their label only.

Go ahead and write the files directly.
