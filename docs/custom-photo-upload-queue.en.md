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
Queue worker (bounded concurrency — up to MAX_CONCURRENT_UPLOADS uploads
in flight at once, claim-exclusive so no two slots ever work the same row)
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

### 5.1 Timeout does not mean cancelled — verify, don't just retry

§5 assumed that when our deadline fires, the request is over. On this stack it isn't.

`@supabase/storage-js` never forwards an `AbortSignal` to the `fetch` it performs: `uploadOrUpdate` calls its internal `put`/`post` helpers without the `parameters` argument that would carry one. So `uploadWithTimeout`'s abort ends *our* wait, not the HTTP request. The request keeps running, and it can still succeed — minutes later, on a server we've stopped listening to. Observed live: after a timeout the retry hits `StorageApiError: The resource already exists` against the insert-only bucket, and the row climbs through attempts 8 → 9 → … → 14 before something finally sticks. Every one of those attempts re-uploaded a file that was already there.

True cancellation is not pursued as the primary fix, because it isn't reliably available: we do not control the SDK's request construction, and even an abort that reaches the platform layer is not guaranteed to tear down a native connection mid-body. Building correctness on it would mean building on a maybe.

The fix instead reclassifies what a timeout *is*. A timeout is now an **ambiguous signal** — the same kind of evidence as the insert-only bucket's "already exists" duplicate error, and treated identically: `UploadEvidence` carries a `timedOutSignal` alongside `duplicatePathSignal`, and `needsBucketVerification` fires on either. The queue then asks the bucket directly whether the object is there:

- object present ⇒ the orphaned request landed after all; the row goes straight to `uploaded`, with no second upload attempted and no attempt wasted;
- object absent ⇒ a genuine failure; the row stays `failed`/retryable exactly as before;
- lookup can't run (offline, auth, rate limit) ⇒ `unknown`, which is *not* success — the row stays retryable. `isUploadSuccessful` is deliberately unchanged: only `apiConfirmed` or an affirmative bucket lookup may ever produce `uploaded`, so a bare timeout can never flip a row on its own.

Complementary, best-effort: the custom `global.fetch` in [`supabaseFetch.ts`](../library/powersync/supabaseFetch.ts) (the one `BackendConnector` hands to the Supabase client, which already force-refreshes the Clerk JWT for storage writes) now also attaches a real `AbortController` scoped to storage uploads only, using the same `UPLOAD_TIMEOUT_MS` constant so the two deadlines cannot drift apart. That is the one layer that actually owns the `fetch` call, so it is the only place the request can be cancelled at all. It *reduces* orphaned server-side requests; it does not eliminate them, and nothing above depends on it working.

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
| Race risk from parallel watch callbacks | Yes, confirmed in the library's current code                           | None — a single claim gatekeeper (bounded, `MAX_CONCURRENT_UPLOADS`-way concurrent execution; exclusivity comes from claim reservation, not from running one row at a time) |
| Where the original is stored            | App's `documentDirectory` (managed by the library)                     | Phone Gallery — outside the app's cache logic                                                 |
| How "success" is determined             | Text match on an error message (`already exists`) — can false-positive | Explicit confirmation from the API response                                                   |
| Request timeout                         | Not set explicitly (client default, risk of hanging)                   | Explicit, short `AbortSignal` on the request                                                  |
| Retry policy                            | Fixed interval (30s) forever, no foreground/background distinction     | Fast retries with UI in foreground, backoff in background                                     |
| Maintenance / future                    | Package is deprecated                                                  | Full control, no dependency on someone else's architectural decisions                         |

## 10. Other implementation nuances

- **Success verification** — don't rely on a text match on an error message ("already exists" ⇒ success). Explicitly check the API response; if needed, add a lightweight check that the object exists in the bucket before the final `status = uploaded`.
- **Insert-only bucket** (`damage-report-photos` doesn't allow upsert) — retry logic needs to account for the fact that a repeat upload to the same path when the file already exists is likely a genuine duplicate (a previous attempt actually landed), not an error; a text-based check is fine only as a secondary signal here, not the sole one.
- **One worker run for the whole queue, with bounded concurrency** — there is still exactly one run at a time (overlapping triggers join the single in-flight run via an `isRunning` flag, unlike the current per-id guard, which doesn't protect against parallel watch cycles), but that run drains through a small pool of lanes rather than a single cursor: `MAX_CONCURRENT_UPLOADS = 3` uploads may be in flight at once.

  Three, because a typical damage report has ~3 photos — the goal is a full report's photos uploading roughly together instead of trickling in behind each other's ~35s timeout budget. The limit is global rather than per table, because what it bounds is concurrent network and memory use on a phone, and that cost doesn't care which table a row came from. The pool is a sliding window, not batches of three: a freed lane claims again immediately, which is what stops one slow or wedged row from stalling the rest.

  Crucially, **exclusivity no longer comes from running one row at a time — it comes from the claim**. `claimNext` is a plain `SELECT`, and nothing beneath the app layer stops two lanes reading the same not-yet-reserved row, so "pick a row" and "mark it `uploading`" are performed as one indivisible step behind an async lock (`withClaimLock` in `photoUploadService.ts`). Once a row is reserved it is no longer `pending`/`failed`, so it is invisible to every subsequent claim. If that reservation write fails even after retries, the claim returns `null` immediately — it does not try the next table, and the lane simply ends; the row is untouched and the existing pass cadence (4s fast / 60s backoff) brings it back. That deliberate refusal to keep trying in-place is what keeps a sick database from turning into a hot loop.

- **Multiple photos in one report** — a report's photos are processed by that same single run, up to `MAX_CONCURRENT_UPLOADS` at a time, never by separate independent parallel runs. The §7 progress bar is unaffected: it counts how many of the report's rows are `uploaded`, which says nothing about how many happen to be in flight at any instant.
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
7. ✅ Parked (`LOCAL_FILE_MISSING`) rows are no longer permanent: every pass re-checks them locally and un-parks any whose file is present, with zero driver taps (§12).
8. ✅ Retry is network-gated via `expo-network`: the upload attempt and the §6.2 bucket verification are skipped while the phone is offline, so no doomed attempt burns an `attempts`/backoff increment (§13).
9. ✅ The pass loop reschedules indefinitely (~60s plateau) while _anything_ is unresolved — including a permanently-missing row — so the §12 sweep keeps running for as long as the app is open.
10. ✅ Every read on `DamageReportPhotos`/`InspectionPhotos` is scoped to the signed-in driver — including the four UI-side reads (`useDamageReportPhotos`, `useInspection`/`useInspectionPhotos`, `useDamageReportById`) that were initially missed, now built from the shared scoped sources in `library/powersync/scoping` rather than each carrying its own filter. These tables sync to every authenticated driver, so an unscoped queue was retrying, counting and bannering photos belonging to other drivers (§15). `DriverDocuments` stays deliberately unscoped — its RLS is already owner-scoped server-side.

## 12. Self-healing parked rows (MISSING_LOCAL_FILE_ERROR)

§5/§6 establish that attempts never truly end. There is one deliberate exception: when `uploadRow` finds no local file at a row's deterministic path (`localFile.ts`), it records `last_error = MISSING_LOCAL_FILE_ERROR` and the row is _parked_ — excluded from `claimNext`/`countActionable` in `tableAdapters.ts` — so the worker doesn't keep burning retry passes on a file that isn't coming back. Parking is not deletion or archival (§3 still holds): the row, `photo_path`, and `gallery_asset_id` are untouched.

Parking used to be effectively permanent — the only way out was the driver manually re-adding or replacing the photo. That was fine as long as "the local file doesn't exist" was itself always accurate. It briefly wasn't, before the `local_uri` column was removed (see the container-drift fix history). Rows parked during that window can carry `MISSING_LOCAL_FILE_ERROR` even though their file was never actually missing.

The rule going forward: every pass (`runPass()` in `photoUploadService.ts`) begins with a bounded _sweep_ of currently-parked rows (`runtime/parkedRowSweep.ts`): for each row still tagged `MISSING_LOCAL_FILE_ERROR`, re-run the same trustworthy `localPhotoExists(photo_path)` check `uploadRow` itself uses. A row whose file is found present is healed via a `local_file_recovered` event (§3's state machine): it returns to `pending` with `last_error` cleared, and re-enters the normal claim path on the very next iteration of the same pass — no driver interaction required. Like every other event, it never decreases `attempts` and never restamps `last_attempt_at`, so the backoff history a row has earned survives the heal.

A row that's still genuinely missing costs the sweep exactly one local filesystem check per pass — no network call. Each table is swept with the same bounded ceiling the §6.2 verification uses (50 rows per table per pass), and a table with nothing parked is skipped on a single `countParked()` — the sweep does no filesystem work at all in the common case. The pass loop reschedules itself indefinitely (on the existing `BACKOFF_RESCHEDULE_MS` cadence) as long as ANY row remains unresolved — including a permanently-missing one — specifically so this sweep keeps running periodically for as long as the app stays open, not just while there's other actionable work. This is what keeps the sweep from becoming a new hot-loop risk: it rides the existing fast/backoff cadence rather than any new timer, and its per-pass cost for a permanently-missing file is bounded and network-free, forever.

This does not change what "confirmed genuinely missing" means for the driver-facing Replace flow (§6.2): that determination is still made only by a direct bucket lookup, never by local file presence/absence.

## 13. Network-aware retry gating

§6's fast/backoff passes assumed a network attempt was always worth making. It isn't, on two counts the driver shouldn't pay for: no connectivity at all, and an upload doomed to time out anyway. Retrying in either case burns battery/data/CPU for a result that was already knowable in advance, and a network failure must never be misread as "the file is confirmed missing."

Signal: `expo-network`'s `getNetworkStateAsync()`/`addNetworkStateListener` (`runtime/networkState.ts`). A phone is treated as offline only when `isConnected === false` or `isInternetReachable === false`; any other state, and any error from the check itself, is treated as online — deliberately fail-open, since a broken network-state read must never permanently silence the queue.

That fail-open extends to the dependency itself. `expo-network` is a native module and resolves at *import* time, throwing when it isn't linked — so a static import would turn "JS shipped ahead of the native build" (an OTA landing on an older binary) into a crash on launch for every driver, which is strictly worse than the wasted attempts this gate exists to prevent. `networkState.ts` therefore resolves it lazily and treats its absence as "always online", i.e. exactly the pre-§13 behaviour. Note that adding this dependency is a native change: it needs an EAS Build (the CI pipeline already routes `package.json` changes that way) and a local `prebuild` before it works in a dev build.

No pre-emptive "slow network" detection: `expo-network` doesn't expose connection-quality signals, and the existing per-request upload timeout (§5) already fails a too-slow attempt fast and hands it to the backoff schedule (§6), which naturally spaces out the next try.

Where the gate applies: the §12 sweep is local-only and always runs, online or not. The actual upload attempt is skipped for the whole pass when offline — checked once per pass, not per row — so an offline session never ratchets `attempts` or `last_attempt_at` forward on a doomed try. The §6.2 direct bucket verification is also skipped when offline, leaving any existing recovery/banner state untouched (it is _not_ cleared — an offline pass is not evidence that the problem went away).

Resuming automatically: `SystemProvider.tsx` subscribes to network-state changes the same way it subscribes to `AppState` foreground transitions. On the offline→online edge (the edge only, not every event), it re-runs the full §6 recovery pass. The pass loop's indefinite rescheduling (§12) is a backup in case a listener event is ever missed.

Every pass, sweep result, network-gate decision, and per-row upload attempt is logged (via `DebugLogger`, which mirrors to `console`, under the greppable tag `PhotoQueue`) so this behaviour is directly observable in the Metro/Xcode console during manual testing.

## 14. Persist-retry and stale-`uploading` reclaim

§3's state machine is only as good as the writes that record it. Every transition is a local SQLite write through the typed Kysely wrappers, and those writes are fast but not guaranteed — the same database is being written concurrently by PowerSync's own sync/crud machinery, so a transient busy/locked error is entirely possible. Before this section, a single such failure was terminal for that row's bookkeeping: the terminal `persist()` inside `uploadRow` threw, the worker's bare `catch {}` swallowed it, and the row was left in `upload_status = 'uploading'`.

That state is uniquely bad. `uploading` is not one of `tableAdapters.ts`'s `UNRESOLVED_STATUSES` (`['pending','failed']`), so `claimNext`, `countUnresolved`, `countActionable`, `countParked` and `listUnresolved` all skip such a row — and so does the driver-facing banner query in `usePhotoUploadBanner.ts`, which filters on the same pair. A row stuck there is unclaimable, uncounted, and never mentioned to anyone. That is correct while an attempt really is in flight and catastrophic once it isn't: an app killed mid-upload leaves exactly this. Real devices were found carrying rows stranded that way for 2–24 hours.

The answer is two layers that stop it happening, and a third that clears whatever still slips through.

**Layer 1 — persist-retry** ([`persistWithRetry.ts`](../library/photoUploadQueue/runtime/persistWithRetry.ts)). Any failing write is simply retried: 3 attempts, 100ms and then 300ms apart. It deliberately does **not** classify the error. There is no stable, driver-independent shape for "this was transient" across the project's two SQLite paths — `@op-engineering/op-sqlite` natively and `@powersync/adapter-sql-js` (WASM) in dev/Expo Go — so any substring or code match would fail open in precisely the situation it exists for. Blindly retrying a genuinely non-transient error costs under half a second and then rethrows, which is cheaper and far safer than being clever.

**Layer 2 — the guaranteed-`failed` fallback** ([`persistUploadEvent.ts`](../library/photoUploadQueue/runtime/persistUploadEvent.ts)). Every terminal write in `uploadRow` goes through this wrapper. When the retries are exhausted it takes one more shot at the only outcome that is always safe to record: `attempt_failed` with `last_error = "Upload attempt result could not be saved after retries"`. `failed` is retryable, counted and banner-visible — strictly better than the truth being lost, even when the outcome we meant to record was `upload_confirmed`. A wrongly-`failed` row costs one redundant attempt that §5.1's verification then resolves to `uploaded`; a stuck `uploading` row costs a photo. With the fallback enabled the wrapper never throws, so no caller in `uploadRow` needs its own try/catch. If even the fallback write fails, it logs at `error` and hands the problem to layer 3.

**Layer 3 — the stale-`uploading` sweep** ([`staleUploadingSweep.ts`](../library/photoUploadQueue/runtime/staleUploadingSweep.ts)). Every pass, immediately after the §12 parked sweep and before the network gate, each table is asked for rows that are still `uploading` with a `last_attempt_at` older than `STALE_UPLOADING_THRESHOLD_MS` (a null timestamp counts as maximally stale). Those rows are reclaimed. This is also what clears the backlog that already exists on drivers' phones from before this section shipped.

- **The threshold is `3 × UPLOAD_TIMEOUT_MS` (~105s).** One deadline's worth would race the very attempt it is meant to protect — clock skew, a persist that lands late, a request finishing just past the deadline. Much longer would leave a genuinely stuck photo invisible to the driver for longer than necessary. Three deadlines sits comfortably past any attempt that is still legitimately alive while still resolving inside a single foreground session.
- **The reclaim reuses `attempt_timed_out`; no new event was added.** That event already means exactly "a real attempt happened, its outcome is unknown, treat it as failed and retryable, and count it against backoff", which is precisely the situation. (Contrast `local_file_recovered`, which genuinely needed its own event because its semantics differ: it is a correction of a bad diagnosis and must *not* spend an attempt.) The reclaimed row gets its own `last_error` — "Upload interrupted (stale uploading row reclaimed)" — so support can tell a reclaim from a real timeout.
- **A row the worker is currently uploading is never reclaimed.** With up to `MAX_CONCURRENT_UPLOADS` lanes running (§10), "stale-looking" and "abandoned" stop being the same thing: a concurrent pass can sweep while another pass's lanes are still working, and §5.1's post-timeout bucket verification can legitimately keep a row `uploading` well past the threshold. The service therefore tracks its own reserved-and-in-progress rows in a `Set` — added the moment a claim's reservation write succeeds, removed in a `finally` when `uploadRow` ends however it ends — and exposes `isRowInFlight`, which the sweep consults via its `isInFlight` option before touching anything. This is shipped and tested, not planned.
- **Cost.** One selective, `LIMIT`ed query per table per pass, almost always returning zero rows — so unlike §12's sweep it needs no cheap count gate in front of it. Bounded at 50 rows per table per pass, local-only (it works offline), and never throwing: a table that errors on list or write is skipped and retried next pass.

None of this widens `UNRESOLVED_STATUSES`. Keeping `uploading` out of the claim path is what stops a row being attempted twice; the sweep is how it stops being a trap.

## 15. Driver scoping

Everything above assumed the photo tables hold this driver's photos. They don't. `DamageReports`/`DamageReportPhotos` are readable by any authenticated driver — the Postgres RLS is `USING (get_current_driver_id() IS NOT NULL)`, not owner-scoped — so every driver's device syncs down every driver's rows. On a real device, a driver who had never been assigned a single trip was found holding 23 damage reports (one of them theirs) and 57 damage-report photos (one of them theirs).

Until this section [`tableAdapters.ts`](../library/photoUploadQueue/runtime/tableAdapters.ts) filtered none of that. The queue claimed, retried, counted, swept and bannered other drivers' photos indiscriminately: a driver could be shown a non-dismissible banner demanding they fix a photo that was never theirs, and tapping it opened a stranger's damage report. Every attempt spent on such a row is also an attempt not spent on their own.

The fix is client-side, deliberately. Tightening the RLS is a backend change with its own blast radius (the web app reads these tables across drivers by design), and it would do nothing about the rows already sitting on drivers' phones.

**The ownership rule.**

- A **`DamageReportPhotos`** row is the current driver's when its `DamageReports` row has `created_by_user_uuid = <Users.id>`.
- An **`InspectionPhotos`** row is the current driver's when its `WorkTrackerInspections` row is referenced by one of that driver's trips: `WorkTrackers.driver_uuid = <Drivers.id>`, with the inspection id matching `pre_inspection_uuid` **or** `post_inspection_uuid`. A trip has a pickup inspection and a dropoff inspection, so both legs count and both are walked.
- An **unattributed row is excluded by SQL itself**. `created_by_user_uuid IS NULL` simply fails `= ?` under SQL's null semantics — there is no separate check, and none is wanted: a photo nobody owns is a photo no driver's queue should be spending attempts on.

**Why `WHERE EXISTS` and not `INNER JOIN`.** Two reasons, and the second is the load-bearing one. First, `EXISTS` composes with the twelve existing queries without touching a single `.select([...])`, `.orderBy(...)` or bare-column `.where(...)` — a join would force every one of those columns to be re-qualified, turning a scoping change into a rewrite. Second, a join can multiply the outer row set and `EXISTS` cannot. Nothing in the schema makes the inspection→trip relationship 1:1 — `WorkTrackerInspections` has no foreign key back to `WorkTrackers`, the reference runs the other way — so one inspection id matched by two trips is a shape the database permits, and under a join it would return the same photo twice: once duplicated inside `claimNext`'s candidate batch, once inside `listUnresolved`'s result. `EXISTS` asks a yes-or-no question and answers it once, whatever the join path underneath looks like. A test pins exactly that case.

**Where the ids come from.** [`library/powersync/scoping/driverScope.ts`](../library/powersync/scoping/driverScope.ts) — a plain module-level store holding `{ userUuid, driverUuid }` as a *branded* `DriverScope`, which only `publishDriverScope` can mint. [`CurrentDriverScopePublisher.tsx`](../components/providers/CurrentDriverScopePublisher.tsx) resolves both reactively from the local DB (Clerk user → `Users.id` → `Drivers.id`, the same chain the rest of the app uses) and pushes them in; `tableAdapters.ts` reads them synchronously. Not a hook and not React context, for the same reason `recoveryStore.ts` isn't: almost none of this code runs inside React. Passes are driven by a timer, an `AppState` transition or a network edge, and there is no render to read a context during. React-side callers subscribe to the same store through [`hooks/useDriverScope.ts`](../hooks/useDriverScope.ts) (`useSyncExternalStore`), so there is one value, not two.

The store used to live at `library/photoUploadQueue/runtime/currentDriverContext.ts` and be owned by the queue. It is no longer the queue's private concern — the same two ids scope the queue's adapters, the banner, and the `hooks/db` reads behind the damage-report and inspection screens — so it moved down to `library/powersync/scoping/`, a leaf that knows only `db` and `AppSchema`, and the queue became one of its consumers. The dependency direction is `powersync/scoping` ← `photoUploadQueue/runtime` ← `hooks/db` ← `features/*`, with no cycles.

**Scoping is a source, not a filter.** [`scopedFrom.ts`](../library/powersync/scoping/scopedFrom.ts) exports `damageReportsOf`/`damageReportPhotosOf`/`inspectionsOf`/`inspectionPhotosOf`, each returning a Kysely builder that *already* carries its ownership predicate. Callers add their own `.select`/`.where`/`.orderBy` on top. This is the difference between "remember to scope" and "there is no unscoped entry point to forget": the four reads that were found unscoped were all `db.selectFrom("DamageReportPhotos")`-style openings that simply omitted a filter, and an omission is invisible in review. An ESLint `no-restricted-syntax` rule (see [`eslint.config.js`](../eslint.config.js)) forbids opening `selectFrom` on either photo table outside the scoping module, so the omission is now a build error rather than a reading-comprehension exercise. Reads that are cross-driver *by design* — bleacher damage, which any driver hauling that bleacher must see — go through `crossDriverRead(reason, query)`, an identity function whose only job is to force a written reason at the call site and make every such read greppable.

`null` — no driver established — is a first-class value, not an error case. Every adapter method checks for it first and returns its empty answer (`null`, `0`, `[]`) without querying at all, so an unresolved context can never degrade into an unscoped read. It is cleared on sign-out, and also the *instant* the Clerk user id changes, by an effect keyed on that id alone and declared before the effect that publishes a real context. React runs effects in declaration order, and on that commit the id lookups still hold the previous driver's values — so the window between two drivers on one device is always "nobody", never "the driver before".

**Scoping requires both ids — a `Users` row is not enough.** `publishDriverScope` is only called once *both* `userUuid` and `driverUuid` resolve (`CurrentDriverScopePublisher.tsx`'s effect bails to `clearDriverScope()` if either is missing). A signed-in driver with a `Users` row but no matching `Drivers` row — never onboarded as a driver, or the `Drivers` sync hasn't landed yet — gets the same `null` context as "nobody signed in": every scoped read, including that driver's own `DamageReportPhotos`, returns empty. This is intentional, not a gap to special-case around: the upload queue is gated on the exact same context, so it would never pick up this user's photos either — a repair UI that showed them anyway would be showing photos nothing will ever actually upload. If a real driver is ever stuck this way, the fix is making sure their `Drivers` row exists/syncs, not loosening the scope check.

`persist()` is deliberately left unscoped on both adapters. It is only ever handed a row that a scoped read already returned, so re-checking ownership there would cost a subquery on the write path to re-prove something already proven.

**Everyone else inherits it.** The §6.2 recovery pass, the §12 parked sweep, the §14 stale-`uploading` sweep and the pass loop's `countUnresolved` re-arm gate all work exclusively from rows a scoped adapter method handed them, so none of them needed changing. There is exactly one exception: [`usePhotoUploadBanner.ts`](../hooks/usePhotoUploadBanner.ts) runs its own join, because it needs the owning report's id and `created_at` and `PhotoUploadRow` carries neither. It no longer repeats the ownership filter, though: it starts from the same `damageReportPhotosOf` source the adapters do, so the join only fetches those two extra columns. It builds no query at all until the scope resolves — so the banner stays silent rather than briefly counting everybody's photos on launch. Its query is exported separately from the hook so it can be asserted against a real database without rendering anything.

**Attribution is now load-bearing.** `created_by_user_uuid` used to be metadata; it now decides whether a photo is ever uploaded, *and* whether the driver who took it can see it. `createDamageReport` used to write whatever its caller passed — an optional `createdByUserUuid?: string | null` — and the inspection flow ([`components/widgets/inspection.tsx`](../components/widgets/inspection.tsx)) was passing nothing, leaving those photos owned by nobody and permanently unclaimable. Its input now carries a required `scope: DriverScope` instead, so "forgot to attribute it" and "attributed it to whatever the caller had lying around" are both unwriteable rather than merely discouraged. Both callers gate their submit on the scope having resolved: `inspection.tsx` gates the *whole* submit rather than just the damage-report branch, because that method writes three things in sequence and discovering a missing scope partway through would commit an inspection it could not finish.

**Indexes.** [`AppSchema.ts`](../library/powersync/AppSchema.ts) gained local indexes for the columns the new predicates filter and correlate on: `Users.clerk_user_id`, `DamageReports.created_by_user_uuid`, `InspectionPhotos.inspection_uuid`, `WorkTrackers.pre_inspection_uuid`, `WorkTrackers.post_inspection_uuid`. These are PowerSync client-side SQLite indexes only — no Postgres migration and no `database.types.ts` change.

**`DriverDocuments` is deliberately not scoped.** Its Postgres RLS is already owner-scoped server-side, so a device never holds another driver's documents and there is nothing for a client-side filter to remove; a driver is also never shown another driver's documents anywhere in the UI. Its adapter is unchanged, and a test pins that as a decision rather than an oversight.
