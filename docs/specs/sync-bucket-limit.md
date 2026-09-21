# Spec — PowerSync bucket limit (PSYNC_S2305) on the mobile stream

> Status: implemented 2026-09-18 (app 1.10.3), not deployed. pgTAP, Jest and a sync-rules simulation all pass locally; see §10.
> Repositories: `bleacher_rentals` (migration + pgTAP), `br_powersync` (sync rules + config), `br_driver` (mobile).
> Hard requirement: **fully backwards compatible**. Builds already on drivers' phones must keep working. There is no OTA, so old builds stay in use for weeks.

## 1. The problem

`max_parameter_query_results` limits the number of **bucket parameter values per connection**. It does not limit rows. When a rule JOINs a table through `WorkTrackers`, PowerSync keys the bucket on a per-trip column. That creates **one bucket per trip**, not one per driver. The mobile stream has 9 such rules:

| Rule                                 | Bucket key                  | Buckets per driver |
| ------------------------------------ | --------------------------- | ------------------ |
| `WorkTrackerLineItems`               | `work_tracker_uuid`         | 1 per trip         |
| `Addresses` (pickup, dropoff)        | `Addresses.id`              | 2 per trip         |
| `Contacts` (pickup, dropoff POC)     | `Contacts.id`               | 2 per trip         |
| `WorkTrackerInspections` (pre, post) | `WorkTrackerInspections.id` | 2 per trip         |
| `InspectionPhotos` (pre, post)       | `inspection_uuid`           | 2 per trip         |

That comes to about 9 per trip, and it only ever grows. A driver with ~220 trips hits even the temporarily raised limit of 2000 (`br_powersync/config/powersync.yaml`). The number of empty buckets counts too: a trip with no photos still produces its 2 photo parameters.

## 2. Decisions

| #   | Decision                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `WorkTrackerLineItems`, `Addresses` (trip pickup/dropoff), `Contacts` and `WorkTrackerInspections` sync **only for active trips**: `completed_at`, `declined_at` and `abandoned_at` are all NULL. |
| 2   | Finished trips read their details from a new `WorkTrackers.history_json` snapshot, built **only by server triggers**. The app never writes it.                                                    |
| 3   | The snapshot is rebuilt when anything it contains changes after the trip finished: line items, addresses, inspections.                                                                            |
| 4   | Inspections get **no** `created_by_driver_uuid`. A trip reassigned from driver A to driver B must still show A's inspection to B. The active-trip JOIN plus the snapshot gives that.              |
| 5   | `InspectionPhotos` gets `created_by_driver_uuid` and is keyed on it (1 bucket per driver). See §4 for why it cannot use the active-trip filter.                                                   |
| 6   | Snapshot address format: `"street, city, state_province zip_postal"`. Blank parts are skipped.                                                                                                    |
| 7   | Snapshot line-item `quantity` comes from `qty_decimal`. The integer `quantity` column is deprecated. `type` is the `work_tracker_line_item_type` enum.                                            |
| 8   | Out of scope: `DamageReportPhotos` by author (photos must reach all drivers anyway) and `RoadmapTaskMessages` (no driver has created any yet).                                                    |

## 3. `history_json` shape

```json
{
  "version": 1,
  "pick_up_address": "123 Main St, Calgary, AB T2P 1J9",
  "drop_off_address": null,
  "line_items": [
    {
      "type": "hauling",
      "quantity": 198.8,
      "unit_amt_cents": 300,
      "description": "198.8MI × $3.00/MI = $596.36"
    }
  ],
  "pre_inspection": {
    "id": "…",
    "created_at": "…",
    "walk_around_complete": true,
    "issues_found": false,
    "issue_description": null,
    "answers_json": "…",
    "bleacher_uuid": "…"
  },
  "post_inspection": null
}
```

- `version` lets the app reject a shape it doesn't know and fall back (see §6).
- `line_items` are ordered by `created_at, id`. An empty array is valid.
- Each inspection object has the same fields as a `WorkTrackerInspections` row. `answers_json` stays a string, so the existing inspection summary code can use it unchanged.
- Postgres type: `jsonb`. PowerSync delivers it to SQLite as text.

## 4. Why `InspectionPhotos` can't use the active-trip filter

The app writes one `InspectionPhotos` row per photo ([inspection.tsx:496](../../components/widgets/inspection.tsx)). The custom upload queue works on these local rows. Today its ownership check walks `InspectionPhotos → WorkTrackerInspections → WorkTrackers.driver_uuid` locally.

Failure scenario with an active-trip filter:

1. A driver finishes a trip offline with photos still `pending`.
2. When the phone reconnects, the CRUD upload succeeds, and the trip becomes finished on the server.
3. The next checkpoint removes the trip's inspection (and, with the filter, its photo rows) from the phone.
4. The upload queue can no longer see or own the photo, so the file is never uploaded. **Data loss.**

Context: production has no photo questions today, and none are planned soon, so the table is empty in practice. Its rules still cost 2 bucket parameters per trip, though, because parameters come from the parameter query, not from data. The fix below is defensive: it removes those parameters and keeps the queue safe if photo questions come back.

Keying photos on their own `created_by_driver_uuid` keeps the row on the phone until it syncs. The queue's ownership check reads that column directly, so it doesn't need the inspection row. Displaying photos doesn't depend on these rows: the summary renders from `answers_json` paths. So reassignment (decision 4) is unaffected.

## 5. Database — `bleacher_rentals/supabase/migrations/<ts>_work_tracker_history_snapshot.sql`

Additive only. Old builds don't see new columns.

1. `alter table "WorkTrackers" add column history_json jsonb;`
2. `alter table "InspectionPhotos" add column created_by_driver_uuid uuid references "Drivers"(id);` plus an index.
3. `build_work_tracker_history(tracker "WorkTrackers") returns jsonb`: builds §3 from the row passed in, so a BEFORE trigger can hand over `NEW`. It reads line items, addresses and inspections by id.
4. **Trigger A** — `BEFORE INSERT OR UPDATE ON "WorkTrackers"` (no column list; see §10):
   - finished → `NEW.history_json := build(NEW)`;
   - not finished (for example, the office reopened the trip) → `NEW.history_json := NULL`.
   - Triggers B–D refresh by updating `WorkTrackers`, which runs trigger A again. It rebuilds from the same rows, so there is no loop.
5. **Trigger B** — `AFTER INSERT OR UPDATE OR DELETE ON "WorkTrackerLineItems"`: rebuild the finished parent tracker(s). Covers both `OLD.work_tracker_uuid` and `NEW.work_tracker_uuid`, so a line item moved between trackers updates both.
6. **Trigger C** — `AFTER UPDATE OF street, city, state_province, zip_postal ON "Addresses"`: rebuild finished trackers that use it as pickup or dropoff.
7. **Trigger D** — `AFTER INSERT OR UPDATE ON "WorkTrackerInspections"`: rebuild finished trackers that point at it.
8. **Trigger E** (old-build compatibility) — fills `InspectionPhotos.created_by_driver_uuid` when an old build left it NULL:
   - `BEFORE INSERT ON "InspectionPhotos"`: resolve through inspection → tracker → `driver_uuid` if both already exist;
   - on `WorkTrackers` when `pre/post_inspection_uuid` gets set: fill the NULL photos of that inspection. Old builds insert photo → inspection → tracker update, in that order, so this is the case that catches them.
9. Backfill:
   - `history_json` for every finished tracker;
   - `created_by_driver_uuid` for every existing photo, via inspection → tracker.

   This is a one-time re-sync of each driver's finished trackers.

10. Regenerate `database.types.ts` in both repos.

## 6. Sync rules — `br_powersync/config/sync_rules.yaml`

New builds connect with `{ app: "mobile", sync_version: 2 }`. The 9 rules from §1 are split into two variants:

- **Legacy** (the current rules, unchanged): `… AND connection.parameter('sync_version') IS NULL`. Old builds keep getting exactly what they get today.
- **v2** (`= 2`):
  - LineItems, Addresses ×2, Contacts ×2 and Inspections ×2 JOIN `WorkTrackers` with `completed_at IS NULL AND declined_at IS NULL AND abandoned_at IS NULL`;
  - `InspectionPhotos` is `JOIN "Drivers" ON "Drivers"."id" = "InspectionPhotos"."created_by_driver_uuid"`;
  - the driver's home `Addresses` rule stays shared by both variants.

The rest of the stream is untouched. The limit stays at 2000 until phase 2 (§9).

Verified against the PowerSync service's own sync-rules library (v0.35.0, the local `journeyapps/powersync-service:1.20.5` image): `connection.parameter('sync_version') IS NULL` compiles, and it matches when the parameter is absent. See §10 for the bucket counts.

## 7. Mobile — `br_driver`

1. `AppSchema.ts`: add `WorkTrackers.history_json` (text) and `InspectionPhotos.created_by_driver_uuid` (text).
2. `SystemProvider.tsx:178`: connect params `{ app: "mobile", sync_version: 2 }`.
3. Write `created_by_driver_uuid` on every `InspectionPhotos` insert, taking the driver id from the driver scope:
   - [inspection.tsx:496](../../components/widgets/inspection.tsx);
   - [applyPhotoRepair.ts:263](../../library/photoUploadQueue/runtime/applyPhotoRepair.ts).
4. Photo queue ownership (`inspectionPhotosOf(scope)` and the table adapter): `created_by_driver_uuid = me`, or, for rows where it's NULL, the existing inspection → tracker chain.
5. `features/trip-history/util/parseHistoryJson.ts` is a pure parser: `string | null → TripHistorySnapshot | null`. Invalid JSON or an unknown `version` returns `null`.
6. `features/trip-history/hooks/useTripHistoryDetails.ts`: for each history trip, uses the snapshot when there is one, and otherwise falls back to the live `useAddress` / `useInspection` / `useWorkTrackerLineItems` reads.
   - The fallback matters while the phone is offline: a trip finished on the device has no snapshot yet, but its live rows are still local.
   - Once it syncs, the tracker update (with its snapshot) and the removal of the live rows arrive in the same checkpoint.
7. Wire the details hook into `TripHistoryScreen`, `HistoryTripCard` (address strings), `CompletedTripItem` (addresses, pre/post inspection) and pay:
   - `PayAmount` is shared with `trip_item`, so give it optional pre-resolved line items instead of forking it.
8. `ContactButton` in history: finished trips no longer have their POC contact locally. It must render nothing when the contact is missing (verify; no crash, no empty sheet).
9. Add the changelog entry and bump the `package.json` version.

## 8. Tests — written first, frozen once green

**pgTAP (`bleacher_rentals/supabase/tests/work_tracker_history_snapshot.test.sql`):**

- Address formatting:
  - all parts;
  - missing city;
  - missing zip;
  - all blank → `null`.
- Line items:
  - order;
  - `qty_decimal` used;
  - empty → `[]`.
- Each of completed / declined / abandoned builds the snapshot. Reopen → `NULL`.
- Line item insert, update and delete after completion rebuild the snapshot. A line item moved between two finished trackers rebuilds both.
- An address edit rebuilds only finished trackers that use it.
- An inspection linked after completion is reflected in the snapshot.
- Updating an active tracker leaves `history_json` NULL.
- Trigger E handles old-build order (photo, then inspection, then tracker update) and the new-build path (column already set, not overwritten).
- Backfill: covers every finished tracker and every existing photo.

**Jest:**

- `parseHistoryJson`: valid input, invalid JSON, unknown version, missing fields.
- `useTripHistoryDetails`: uses the snapshot when present, falls back to live rows when absent.
- Photo ownership query: matches on the own column, falls back to the chain for NULL rows, excludes other drivers.
- Inspection and repair photo inserts include `created_by_driver_uuid`.
- Connect params include `sync_version: 2`.

**Manual (staging):**

- An old build against the new rules behaves exactly as before.
- Upgrading from an old build with `pending` photos: the photos still upload.
- Finishing a trip offline, then reconnecting: history stays filled the whole time.
- A driver with >220 trips syncs on the new build.

## 9. Rollout

1. **Migration.** Additive, safe for old builds.
2. **Sync rules phase 1** (legacy + v2), then restart PowerSync. Nothing changes for old builds.
3. **Release the new build.** New-build drivers drop to a few dozen buckets immediately.
4. **Raise the `AppVersionPolicy` minimum** to the new build once it's live on both stores.
5. **Phase 2**, once no old builds connect: delete the legacy rules and set `max_parameter_query_results` and `max_buckets_per_connection` back to 1000.

Until phase 2, heavy drivers on old builds can still hit the limit. Updating the app fixes it for them.

## 10. Implementation notes (2026-09-18)

What changed from the plan above while building it:

- **Trigger functions are `SECURITY DEFINER`**, like the other mirror triggers. A pgTAP test showed the gap: a driver fixing a shared address ran the refresh under their own RLS, so other drivers' finished trips weren't updated. The helpers (`build_…`, `refresh_…`, `format_history_address`) have `EXECUTE` revoked from `anon`/`authenticated`, so they aren't exposed as RPCs.
- **The snapshot trigger fires on every `WorkTrackers` insert/update, not `UPDATE OF completed_at, …`.** The finish timestamps are usually stamped by `set_worktracker_status_timestamps` from a status-only update, and a column list only sees the statement's `SET` list.
- **`updated_at` bump.** Refreshes and the backfill bump `WorkTrackers.updated_at` through the existing trigger. No reader orders or compares that column.
- **Photo ownership: the column wins over the chain.** `inspectionPhotoOwnedBy` is `created_by_driver_uuid = me`, or, when that is NULL (old-build rows), the old inspection → trip chain. On a reassigned trip the photo stays with whoever took it, because the file is on their phone.
- **One insert for inspection photos.** `library/photoUploadQueue/runtime/inspectionPhotoInsert.ts` is used by both the inspection screen and the photo repair, and it writes the driver from `getDriverScope()`.
- **History detail seam.** `resolveTripHistoryDetails` (pure, tested) chooses snapshot or live data all-or-nothing, and `useTripHistoryDetails` is a thin hook over it. `PayAmount`/`PayBreakdownSheet` take optional `lineItems`. Snapshot addresses are passed as `{ street: "<whole line>" }`, which `formatAddress` returns unchanged.
- **Bucket counts for one driver** (3 active trips), computed with the service's library against the real `sync_rules.yaml`:

  | Finished trips | Old build | `sync_version: 2` |
  | -------------- | --------- | ----------------- |
  | 100            | 724       | 25                |
  | 200            | 1424      | 25                |
  | 1000           | 7024      | 25                |

  Old builds get exactly what they got before the change.

- **Pre-existing, unrelated:** `supabase/tests/driver-scorecard.test.sql` fails with and without this migration.
- **`database.types.ts` was hand-edited in both repos** (two columns and one FK). Regenerate with `npm run generate-types-local` in bleacher_rentals once the migration is applied.

## 11. Sync Health — seeing who is close to the limit (2026-09-21, app 1.10.4)

The fix above removed the per-trip buckets; this is how we watch that it stays
that way. The only place that knows a device's real bucket count is the device,
so the app reports its own.

**Mobile (`br_driver/features/sync-health/`)** — after a sync finishes
successfully (`isSyncSettled`: connected, `hasSynced`, not downloading, no
download error), `readBucketCount` runs the one raw SQL of the feature,
`SELECT count(*) FROM ps_buckets WHERE name != '$local'`. `ps_buckets` is
PowerSync's own table and is not in `AppSchema`, so the typed wrapper cannot
express it; `$local` is the SDK's pseudo-bucket for pending writes and is not
something the server sent. The number is written with `executeTypedMutationVoid`
onto the driver's own Drivers row — local-first, so a report taken in a dead
zone uploads later with the time it was measured. `createBucketCountReporter`
allows one report per launch and then one per six hours: the report's own upload
causes another finished sync, so without the throttle it would feed itself.
Mounted from `AppVersionGate`, next to the app-version report.

**Database** — `20260921120000_driver_sync_health.sql` adds `bucket_count`,
`sync_version` and `bucket_count_reported_at` to Drivers (no new table). No
default: NULL means "this build never reported", which the page shows as "—",
not 0. Writes need no new policy — `driver_self_update` already limits a driver
to its own row. Developers were not in `drivers_select`, so they get
`drivers_developer_select`.

**Sync rules** — the mobile stream needed no change: the driver's own Drivers
row already syncs whole. On the web stream the three Drivers rules (admin,
account manager, viewer) were rewritten to an explicit column list without the
three new columns — **a new Drivers column now has to be added there by hand to
reach the web app**. Developers get the numbers from two extra rules that alias
the output tables, `DriverSyncHealth` (from Drivers) and `DriverSyncHealthUsers`
(from Users, names only). The alias matters: a developer who is also an admin
would otherwise receive the same Drivers row from two buckets with different
columns. Both are one shared bucket, so they cost a developer 2 buckets.

**Web** — `/dev-tools/sync-health`, developer-only at three levels: RLS, the
sync rules, and `syncHealthGate` in the page. The route guard matches by prefix
and admins/viewers hold `/dev-tools`, so the page's own gate is what turns them
away; developers are given that one path, not `/dev-tools`. The table sorts by
count, flags from 70% of the limit (1400 of 2000), and keeps "no report yet"
distinct from a real 0.

Rollout order: migration → sync rules + PowerSync restart → new build. The page
is empty until builds with 1.10.4 are out, which is expected.
