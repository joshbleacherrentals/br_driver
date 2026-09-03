---
description: Write the release notes for a PR
argument-hint: <PR number>
---

Write the release notes for PR
https://github.com/joshbleacherrentals/br_driver/pull/$1

Read the **whole** PR — every commit and every changed file, not just the
description — then:

1. **Pick the new version.** Look at `features/changelog/entries.json` and
   increment from its newest entry in proportion to what this PR actually
   contains (patch for fixes, minor for new features, major for breaking
   changes). This is also the App Store version — `entries.json` is the single
   source of truth for version history, and `package.json` must match its
   newest entry exactly.
2. **Add a new entry** to the top of the array in
   `features/changelog/entries.json`:

   ```json
   {
     "version": "<new-version>",
     "date": "YYYY-MM-DD",
     "body_md": "### 🚚 What changed\n\n..."
   }
   ```

   `entries.json` is what ships in the bundle directly — Metro imports `.json`
   natively, so there's no separate generate step and nothing to keep in sync.

3. **Bump `"version"` in `package.json` to the same `<new-version>`.** CI
   (`scripts/changelog/checkChangelog.cli.ts`) requires exactly one new entry
   per PR, newer than anything on the target branch, with a valid date and a
   real body — _and_ rejects the PR if `package.json` doesn't match it exactly.

## Who is reading this

**Drivers.** Not technical, usually on a phone, often mid-shift. They care about
what they tap, where it is, and what is different from yesterday.

## How to write it

- **Short and to the point.** Only what a driver will notice. Leave out
  refactors, dependency bumps and internal plumbing.
- **Be specific about location** — name the screen, the tab, the button. "The
  camera button on the damage report screen", not "improved damage reports".
- Lead with what changed for the driver, not with how it was built.
- Match the tone and structure of the most recent entry in
  `features/changelog/entries.json`.
- Supported markdown is limited (see `features/changelog/util/parseMarkdown.ts`):
  `###` headings, paragraphs, `-` bullets, `**bold**`, `*italic*`, `` `code` ``.
  No images, no HTML, and links render as their label only. Write `body_md` as
  a single JSON string with `\n` for line breaks.

Go ahead and write the file directly.
