# Kickoff — Custom Photo Upload Queue implementation

> **Read this file first, in full, before touching any code.** It is the entry point for this task. It tells you what to read next, in what order, and what is already decided vs. still open.

## 1. Read in this order

1. **[custom-photo-upload-queue.md](custom-photo-upload-queue.md)** (or the identical [.en.md](custom-photo-upload-queue.en.md)) — the design doc. Read it **completely** before writing anything. Section 11 lists every decision already made; don't re-litigate those, don't re-derive behavior from first principles or from this kickoff file's summaries — the design doc is the source of truth, everything below is operational context on top of it.
2. **This file, section 3** — what test/contract work already exists in this repo, its current state, and two decisions the previous session flagged as needing resolution before writing real logic.
3. **[BleacherRentals-BrandBook.html](BleacherRentals-BrandBook.html)** — only when you get to UI/UX work (the progress-bar modal from §7, the banner from §6). Any color, spacing, or type choice must come from there — per this repo's `CLAUDE.md`, never hardcode a hex color; if the brand book doesn't cover something needed, add it to `constants/Colors.ts` first.

## 2. Repo map — this task touches two separate git repositories

| What | Where |
|---|---|
| App code, design doc, tests, `AppSchema.ts` | this repo (`br_driver`) |
| **Postgres migrations** | a **different** repo: `/Users/maksonchik/Documents/GitHub/bleacher_rentals/supabase/migrations` — new `.sql` file goes there, not here. Follow the existing naming convention in that folder: `YYYYMMDDHHMMSS_short-description.sql` (e.g. `20260318184809_bleacher-fields.sql`) |
| Regenerating `database.types.ts` | run from the `bleacher_rentals` repo: `npm run generate-types-local` (against a local Supabase) or `npm run generate-types-staging` (against the staging project) — then **copy the resulting `database.types.ts` into this repo's root** (`br_driver/database.types.ts`), which is what `library/powersync/types.ts` imports from (`../../database.types`) |

Both repos are on disk locally — you can read/write both, but they are independent git histories. Don't assume a commit in one is visible from the other.

## 3. Testing handoff — what already exists, verbatim from the previous session

The following is the full handoff from the chat that set up the test scaffolding, preserved as-is so nothing gets lost in re-summarization. **Current state re-verified before writing this kickoff doc: `npm run test` → 8 suites, 38 failed / 19 passed / 57 total — matches the numbers below exactly.**

> ### Context and goal
> You're working on a serious bug: the app's current photo queue (`@powersync/attachments`) has a structural flaw — the list of "which photos are still needed" is recomputed from scratch on every change to related tables, and if that recomputation ever returns an incomplete snapshot, the photo gets marked `ARCHIVED` and is physically deleted before a confirmed upload to Supabase Storage. Result: the DB row exists, the bucket file doesn't, the original is lost for good. The package is also deprecated.
>
> The fix is a custom queue, designed in `docs/custom-photo-upload-queue.md` (+ `.en.md`, identical content in English) — a design doc marked "not yet implemented," with every key decision already made (section 11). **The next chat must read that document in full before writing anything — it is the source of truth for behavior, not this summary.**
>
> Since the app had no tests at all, and the bug is critical (user data loss), the decision was to write **specification-first unit tests** — tests written before the implementation, encoding the expected behavior from the doc. Core principle: **once the logic is written, the tests must not change to fit it — the logic is built to satisfy the tests, not the other way around.**
>
> ### What's already done (all on branch `q3-sprint3-bug-fixes`)
>
> **1. Test framework** — `jest-expo@55.0.20` + `jest@^29.7.0` + `@types/jest` added as devDependencies, versions matched to this repo's exact stack (Expo 55.0.26 / RN 0.83.6 / React 19.2.0). New `npm run test` (and `test:watch`) scripts. Config in `jest.config.js`.
>
> **2. Contract (stubs, NO real logic)** — `library/photoUploadQueue/`
> 9 modules + a re-export, each explicitly marked `NOT IMPLEMENTED` in comments, with deliberately wrong bodies (so tests fail on real assertion diffs, not import errors):
>
> | File | What it covers |
> |---|---|
> | `types.ts` | `UploadStatus`, `UploadEvent`, `PhotoUploadRow`, `UploadEvidence`, `BannerState`, `RecoveryDecision` — shared types |
> | `uploadStatus.ts` | state machine `pending→uploading→uploaded/failed` (design doc §3) |
> | `uploadSuccess.ts` | explicit success determination, duplicate-signal only as a secondary cue (§9-10) |
> | `backoff.ts` | 30s→1min→5min→plateau schedule (§6); `BACKOFF_SCHEDULE_MS` is already real |
> | `recovery.ts` | the "1 minute → banner" rule (§6); `FAST_RETRY_WINDOW_MS` is already real |
> | `banner.ts` | banner count/copy (§6, §11.6); `PHOTO_UPLOAD_BANNER_TITLE` is already finalized |
> | `contentType.ts` | MIME from extension (§3, §10) — the stub currently reproduces the existing `image/jpeg`-for-everything bug on purpose |
> | `uploadTimeout.ts` | `AbortSignal` wrapper (§5); `UPLOAD_TIMEOUT_MS = 35_000` is already real |
> | `worker.ts` | serialized worker, dependency-injected (`claimNextPendingRow`/`uploadRow`) (§10) |
> | `index.ts` | public re-export |
>
> **3. Tests** — `library/photoUploadQueue/__tests__/`
> 8 test files (one per module above) + `support.ts` with helper utilities and a comment explaining the approach. Current state: **57 tests, 38 failing** — this is the expected, correct red state pre-implementation; every failure is a real assertion diff, no crashes or import errors. `npm run tc` and `npm run lint` are clean.
>
> **4. Independent test audit** (separate agent, Sonnet 5)
> Re-read the doc from scratch, re-ran the tests multiple times, checked for flakiness/hardcoding/vacuous assertions. Verdict: the suite is reliable, safe to build against. Two notes:
>
> - **Needs a decision before you start:** `uploadStatus.test.ts:117-138` hard-ties the `attempts` increment specifically to the `attempt_failed` event. The doc only says "attempt counter," without specifying which event increments it — if the real implementation counts from `attempt_started` instead, this test could fail even in a correct implementation. **The first thing to do in the new chat is explicitly decide this semantic** (and adjust the test if needed) before writing logic.
> - **Minor, not a blocker:** `banner.test.ts:42-50` checks the banner subtitle via `.toContain(...)` fragments rather than an exact string match, even though §11.6 of the doc already finalized the exact text. Could be tightened to an exact match.
> - **Low flake risk** in `worker.test.ts` (`waitFor` with a real 500ms budget) — confirmed stable across 5 runs, doesn't need changes.
>
> **5. What's NOT covered by tests (a deliberate boundary, not a defect)**
> The contract is pure functions with dependency injection, with no direct touch on PowerSync/Kysely/`expo-media-library`. So the "glue layer" (real `executeTypedMutation`/`useTypedQuery` calls, real Gallery interaction, the Postgres migration for the new fields on `DamageReportPhotos`/`InspectionPhotos`, the new `DriverDocuments` table) has no test plan yet at all — that's the next, separate piece of work (integration tests, not unit).

## 4. What to do, in order

1. Read `docs/custom-photo-upload-queue.md` in full (section 1 above).
2. Decide the `attempts` semantics — which event increments it — and align the test at `uploadStatus.test.ts:117-138` with that decision (either the implementation matches the existing test, or you deliberately change the test and say why, before writing the logic it would otherwise be shaped by).
3. Implement the real logic in the 9 files under `library/photoUploadQueue/*.ts`. Do not edit the tests to fit the logic — only the two items already flagged above (`attempts` semantics, and optionally tightening the banner subtitle assertion to the exact finalized string) are legitimate test edits, and both should happen *before* or independently of writing the logic, not as a reaction to a failing test later.
4. Run `npm run test` — goal: all 57 green, without having bent tests to match the logic along the way.
5. Postgres migration (new fields on `DamageReportPhotos`/`InspectionPhotos`, new `DriverDocuments` table per doc §3) — file goes in `bleacher_rentals/supabase/migrations` (section 2 above), then regenerate and copy `database.types.ts` back into this repo.
6. Wire the queue into the real screens (damage report, inspection, driver-documents/`EditProfileDocs.tsx`). Any UI touched here (progress modal from §7, banner from §6) follows the brand book (section 1 above) — no hardcoded colors, use `constants/Colors.ts`.
7. E2E/functional/network-level tests are a later, separate phase — not part of this pass.
