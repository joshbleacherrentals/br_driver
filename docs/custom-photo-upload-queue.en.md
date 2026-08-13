# Custom Photo Upload Queue (Damage Report Photos)

> Status: design doc, not yet implemented.
> Scope: **all photo types** in the app — damage report, inspection, driver-documents (license/insurance/medical card). The bug was first identified on damage reports (`DamageReportPhotoAttachmentQueue`), but the same pattern (`@powersync/attachments` / manual inline upload with no queue for inspection) is being replaced with the custom solution everywhere at once, not phased in.

## 1. Problem we're solving

Damage report photos are currently handled by `@powersync/attachments` (`AbstractAttachmentQueue`). It has a structural flaw: the list of "which photos are still needed on this device" is recomputed from scratch on every change to related tables (`DamageReportPhotos`, `DamageReports`, `Drivers`), and if that recomputation ever returns an incomplete snapshot — a photo that hasn't finished uploading yet gets marked `ARCHIVED` and is later physically deleted by the local `expireCache()`, **without ever reaching Supabase Storage**. Result: the DB has a `DamageReportPhotos` row with a `photo_path`, but the bucket has no file, and there's nowhere left to recover it — the original is permanently lost.

Additionally: the library is officially deprecated (PowerSync is moving attachment logic into each platform SDK separately), and based on the current code on GitHub, the same architectural flaw remains there.

**Goal of the custom solution:** guarantee that once a photo is taken, it will eventually reach Supabase Storage no matter how long that takes, and that no background "cleanup" logic can ever delete it before a confirmed successful upload.

## 2. Architecture — high-level flow

```
Camera / gallery picker
      │
      ▼
Copy saved to phone Gallery (MediaLibrary) ── permanent home for the original
      │
      ▼
Same DamageReportPhotos row updated (new fields, upload_status = pending)
      │
      ▼
Queue worker (one active run at a time, no parallel races)
      │
      ├─ app in foreground, user waiting → fast retries + progress modal
      └─ app just opened, old pending rows exist → background pass with backoff
      │
      ▼
Upload confirmed successful → upload_status = uploaded
(file in Gallery is NEVER deleted)
```

Key difference from PowerSync: **there is no place where "is this photo still needed" is recomputed from a JOIN across multiple tables**. Each photo's state is driven solely by its own `upload_status` field on `DamageReportPhotos`, changed only by explicit upload-logic code. Nothing can silently "forget" about a row.

## 3. Extending `DamageReportPhotos` instead of a new table

No new table — what was originally proposed as a separate `PhotoUploadQueue` becomes new fields on the existing `DamageReportPhotos` row. `upload_status` already exists and already carries `pending`/`uploaded`/`failed` — we don't duplicate the state, we extend the same one (add an `uploading` value).

New fields to add to `DamageReportPhotosCols` in [AppSchema.ts](../library/powersync/AppSchema.ts:174):

| Field              | Purpose                                            |
| ------------------ | --------------------------------------------------- |
| `gallery_asset_id` | Gallery asset id (for looking the file back up)      |
| `attempts`         | attempt counter (for backoff, not for "giving up")   |
| `last_attempt_at`  | timestamp of the last attempt                        |
| `last_error`       | text of the last error (for debugging/support)       |

The on-device file path itself is never stored as a column — it's deterministic from `photo_path` (see [`localFile.ts`](../library/photoUploadQueue/runtime/localFile.ts)), so every reader recomputes it live instead of trusting a persisted value that could go stale (e.g. across an app container change).

`photo_path` (already exists) stays as the bucket path — no separate `remote_path` needed.

No "delete if not in the list" — a row is never deleted or archived as a side effect; `upload_status` is only ever changed by the actual upload logic after a real attempt.

**Important nuance:** `DamageReportPhotos` is a table synced with Supabase (via PowerSync sync rules), not a local-only one. This means:

- the new fields need to be added to the Postgres table too (migration + regenerating `database.types.ts`), not just in `AppSchema.ts`;
- `gallery_asset_id` is, by nature, a value that only makes sense on the device that captured the photo — but since the field lives on a synced table, it will physically travel to the server and to other devices (where it'll just be irrelevant/empty for them). This doesn't break anything, just adds a bit of "noise" to synced data;
- upside: `attempts`/`last_error`/`last_attempt_at`, being synced, become visible on the backend too — support can see from the DB/dashboard why a specific photo isn't uploading on a specific device, without pulling logs off the driver's phone.

### Extending to all photo types

The same set of fields (`gallery_asset_id`, `attempts`, `last_attempt_at`, `last_error` + `upload_status`) gets added the same way to:

- **`InspectionPhotos`** — it currently has no `upload_status` at all; that field needs to be added too. Right now [InspectionPhotoAttachmentQueue.ts](../library/powersync/InspectionPhotoAttachmentQueue.ts) doesn't even keep a queue — it uploads inline in the same call, with no retry and no persisted state. Moving to the shared pattern isn't just an archival fix (there wasn't one to fix here) — it's adding the retry/backoff itself, which doesn't exist at all today.
- **Driver-documents** — decision made: **a new table**, e.g. `DriverDocuments`, one row per document (license / insurance / medical card), same shape as `DamageReportPhotos`/`InspectionPhotos` (`driver_uuid`, `doc_type`, `photo_path`, `upload_status`, `gallery_asset_id`, `attempts`, `last_attempt_at`, `last_error`). Unlike the photo queue, a new table is justified here: the current shape (3 separate columns on `Drivers`) is already an awkward model for a list of documents (it already complicates [PhotoAttachmentQueue.ts](../library/powersync/PhotoAttachmentQueue.ts)'s `onAttachmentIdsChange`, which does a `UNION` of three `SELECT`s), and a tripled set of 15 new columns on `Drivers` would only make that worse. `Drivers.license_photo_path` etc. become derived (read from `DriverDocuments` by `doc_type`) after migration, not the source of truth.

  **PDF nuance:** [EditProfileDocs.tsx](../features/profile/components/EditProfileDocs.tsx) offers **three** ways to add a document — camera (`pickFromCamera`), photo library (`pickFromLibrary`), file/PDF (`pickFile`, `DocumentPicker` with `type: ["image/*", "application/pdf"]`). The queue/`upload_status`/retry/backoff/verification/banner work identically across all three — regardless of file type or source, since they protect against "DB row with no matching file in the bucket," not any specific format. The only difference is the Gallery step — see section 4.

  Also, since we're already touching this code: [PhotoAttachmentQueue.ts:112](../library/powersync/PhotoAttachmentQueue.ts) currently hardcodes `media_type: "image/jpeg"` for every file — meaning PDFs get uploaded to Supabase Storage with the wrong `Content-Type`. Worth fixing to derive the type from the file extension (`.pdf` → `application/pdf`) while migrating to the new table.

## 4. Saving the original — Gallery only for camera-captured content

> Decision made: add `expo-media-library` now, not deferred to a separate release. But it applies selectively — not to every source.

**Core principle: the Gallery is only needed when the app itself just CREATED the file (camera).** If a file is PICKED from something that already exists — the photo library, or Files/Drive for a PDF — the original already lives in a permanent location outside our control, and there's nothing to duplicate: it survives any app-level cache wipe on its own.

| Source | Example | Do we duplicate into the Gallery? |
| --- | --- | --- |
| Camera (`launchCameraAsync`) | damage report, inspection, driver-doc camera option | **Yes** — it's the only copy until we persist it ourselves |
| Photo library (`launchImageLibraryAsync`) | damage report "add from gallery," driver-doc "from library" | No — the original is already in the Gallery, that's where it was picked from |
| File/PDF (`DocumentPicker`) | driver-doc PDF/scan | No — and technically impossible: `expo-media-library` only handles photos/video, a PDF can't go in it |

For the "no" rows, the local working copy just stays in `documentDirectory` (as it does today) — no Gallery involved. This is no less safe with respect to the actual bug (archival and deletion happens to the `documentDirectory` copy, not from OS cache pressure) — it's simply missing the extra safety layer that isn't needed here anyway, since the original is already recoverable at its source.

Details for the camera case (where duplication actually happens):

- Right after capture — a copy is written to the system Gallery via `expo-media-library` (`saveToLibraryAsync`, or `createAssetAsync` if an asset id is needed for later lookup).
- This moves the original file **outside** the reach of any app-level cache — the Gallery isn't subject to any "cache limit" or "expire" logic the app itself writes.
- Consequences to plan for:
  - A new permission is required (`MediaLibrary.requestPermissionsAsync()`) — a separate access prompt that doesn't exist today.
  - `expo-media-library` is a new native module, not currently in `package.json`. This means: **a native build via EAS, not a plain OTA deploy** (per the project's CI/CD pipeline, a `package.json`/native-dependency change always triggers an EAS Build, not a JS-only OTA). This affects the release timeline for this feature.
  - The one risk left outside the app's control — the user manually deletes the photo from the Gallery. That's an acceptable, expected edge case (unlike the current situation, where the app itself silently deletes files).

## 5. Timeout — per HTTP request, not "a deadline on everything"

Timeout here solves a narrow problem: don't let one hung network request (dead socket, no response) block the queue forever.

- Put an `AbortSignal` on the upload request itself, with a relatively short limit (e.g. 30-45s — a photo is hundreds of KB to a couple MB, no need for longer).
- Side note: Supabase Storage's standard upload already has a built-in default timeout of ~5 minutes — too long for our case (the user is standing there waiting), so our own shorter `AbortSignal` makes sense.
- **Timeout ≠ "stop trying."** After a timeout abort, the row stays `pending`/`failed`, and the queue picks it up again on the next attempt. There is no global "5 minutes and that's it" — that would recreate the exact photo-loss problem we're moving away from.

## 6. Backoff and failed-upload notifications

Two different situations with different behavior:

1. **User is in the app, modal saying "don't close the app, photos are uploading" with a progress bar.** This needs fast, near-immediate retries — the user is actively waiting, speed and visible progress matter. Backoff would only get in the way here.
2. **Background recovery** — the app was just opened (an hour/day later), and there are old `pending`/`failed` photos left from a previous session. Backoff (30s → 1min → 5min → plateau) makes sense here, so the network isn't hammered for nothing while the user isn't even watching or waiting for a result right now.

Backoff is about "don't spam the network needlessly," not about limiting the number of attempts. Attempts never truly end (or end very far out — weeks, not minutes), just with a growing pause between them in background mode.

### The "1 minute → banner" rule

Concrete UX for scenario 2 (decision made):

1. On every app open/foreground transition, if there are photos with old `pending`/`failed` status, the worker gets **1 minute of fast retries** (no backoff pauses) — a real chance to quietly finish uploading before bothering the driver.
2. If after 60s a photo still isn't `uploaded` — before showing anything, we run a **direct verification against the bucket** (not just trusting the local `upload_status`), to rule out a false "failed" where the file actually did land but the state just hasn't caught up yet.
3. If verification confirms the file genuinely isn't there — show a **non-dismissible banner at the top of the app**, the same component pattern already used for "Documents Expired" (`ProfileCompletionBanner` in [onboardingBanner.tsx](../components/widgets/onboardingBanner.tsx)): red, always visible.
4. After that, the worker drops back into normal background backoff — the banner stays visible until every problem photo has uploaded.

### Banner behavior with multiple reports

- Banner copy shows a count. Final wording: **title "Photo Upload Issue", subtitle "N report(s) have photos that failed to upload — tap to retry."** (mirrors `ProfileCompletionBanner`'s title/subtitle shape: `"Documents Expired"` / `"Update {docs} before you can accept trips"`.)
- Tapping the banner opens the **newest** report with a problem photo (not a list — straight to a specific report, same as "Documents Expired" goes straight to the profile screen).
- When that report's photo finishes uploading (manual Retry, or on its own via backoff) — the banner's count drops by 1, and the next tap goes to the next-most-recent problem report. So it works newest-to-oldest, one at a time, instead of a flat list.
- Once the last problem report is cleared, the banner disappears on its own.

## 7. Retries + UI (progress-bar modal)

- While the current report's photos are still uploading, show a modal that blocks closing the screen ("don't close the app, photos are uploading"), with a progress bar (how many of N photos are `uploaded`).
- The modal closes itself once all of this report's photos are `uploaded`, OR the user explicitly agrees to leave ("it'll finish uploading later, in the background").
- If the user does leave — that's fine: the rows stay `pending`, and the next time the app is opened (an hour, ten hours, a day later), the worker picks them back up and continues — this is exactly what satisfies "the photo has to get there even if I left for 5-10 hours." This is **not** true background upload while the app is fully killed (that would need native background upload tasks — a separate, much bigger task that isn't needed here, since the main scenario is the user staying in the app with the modal).

## 8. Do we need chunked/resumable upload — no

- Chunked/TUS upload in Supabase is recommended for files **>6MB** or very unstable connections where you need to resume mid-file.
- Camera photos (JPEG, ~0.8 quality) typically weigh hundreds of KB to 1-2MB — a single regular request is enough.
- Chunking adds real complexity (byte-range tracking, server-side reassembly, a separate API) with no matching benefit at this file size. Not worth it for this task.

## 9. Comparison with the PowerSync version

|                                         | PowerSync `@powersync/attachments`                                     | Custom queue                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Source of "is this photo still needed"  | SQL JOIN across 3 tables, recomputed on every change                   | The row's own `upload_status` field on `DamageReportPhotos` — nothing external decides for it |
| Race risk from parallel watch callbacks | Yes, confirmed in the library's current code                           | None — a single serialized worker                                                             |
| Where the original is stored            | App's `documentDirectory` (managed by the library)                     | Phone Gallery — outside the app's cache logic                                                 |
| How "success" is determined             | Text match on an error message (`already exists`) — can false-positive | Explicit confirmation from the API response                                                   |
| Request timeout                         | Not set explicitly (client default, risk of hanging)                   | Explicit, short `AbortSignal` on the request                                                  |
| Retry policy                            | Fixed interval (30s) forever, no foreground/background distinction     | Fast retries with UI in foreground, backoff in background                                     |
| Maintenance / future                    | Package is deprecated                                                  | Full control, no dependency on someone else's architectural decisions                         |

## 10. Other implementation nuances

- **Success verification** — don't rely on a text match on an error message ("already exists" ⇒ success). Explicitly check the API response; if needed, add a lightweight check that the object exists in the bucket before the final `status = uploaded`.
- **Insert-only bucket** (`damage-report-photos` doesn't allow upsert) — retry logic needs to account for the fact that a repeat upload to the same path when the file already exists is likely a genuine duplicate (a previous attempt actually landed), not an error; a text-based check is fine only as a secondary signal here, not the sole one.
- **One active worker for the whole queue** — no races from parallel runs (just an `isRunning` flag or a serialized promise chain), unlike the current per-id guard, which doesn't protect against parallel watch cycles.
- **Multiple photos in one report** — processed sequentially by the same worker; the progress bar counts N of M, rather than running through separate independent parallel runs.
- **Retention of bookkeeping fields** (not files, not rows!) — unlike a separate table, a `DamageReportPhotos` row can't be deleted (it _is_ the record that the photo exists on the report). At most, `last_error` could be periodically cleared after success so stale diagnostics don't linger; the file in the Gallery is unaffected either way.
- **Postgres migration + `database.types.ts`** — new fields on a synced table mean a real DB migration on the backend (not just editing `AppSchema.ts`), and regenerating types before `PowerSyncColsFor<"DamageReportPhotos">` will accept the new columns.
- **Correct Content-Type for PDF** — fix the `media_type: "image/jpeg"` hardcode in `PhotoAttachmentQueue.newAttachmentRecord` (see section 3) to derive it from the file extension, otherwise PDFs keep uploading with the wrong header.

## 11. Decisions made / what's still open

**Decided:**

1. ✅ Add `expo-media-library` now, don't defer it — despite it triggering an EAS Build instead of OTA.
2. ✅ The pattern is extended to all photo types at once: damage report, inspection, driver-documents (including the camera path in `EditProfileDocs`, where the same bug genuinely reproduces).
   - **Clarification:** Gallery duplication applies only to the camera source. Library-picked photos and PDFs from Files are not duplicated (not needed, and technically impossible for PDF) — they're already persistent at their source, so they just stay in `documentDirectory`. The queue fix itself (no archival, with verification, retry/backoff, banner) works identically across every source and file type.
3. ✅ Backoff + banner: 1 minute of fast retries on app open → bucket verification → non-dismissible banner at the top (same as `ProfileCompletionBanner` for "Documents Expired").
4. ✅ Data shape for driver-documents — a new `DriverDocuments` table, one row per document, same template as `DamageReportPhotos`/`InspectionPhotos`.
5. ✅ Banner with multiple problem reports — "N reports" counter, tap goes to the newest, count drops after a fix and moves to the next-most-recent (newest to oldest).
6. ✅ Banner copy finalized: title **"Photo Upload Issue"**, subtitle **"N report(s) have photos that failed to upload — tap to retry."**
