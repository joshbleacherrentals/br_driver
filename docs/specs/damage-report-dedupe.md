# Spec B — damage report deduplication ("Select all that apply")

> Status: spec, not yet implemented.
> Repositories: `br_driver` (mobile), `bleacher_rentals` (web + migration), `br_powersync` (one new sync rule).
> Depends on [driver-fixed-damage-reports.md](driver-fixed-damage-reports.md) (Spec A) — the cards and the checklist render the `Fixed` badge, and acknowledging an existing report clears that flag.

## 1. The task

Managers receive several reports about **the same** piece of damage. This is not a duplicate-submission bug: driver 1 files a report, a week later driver 2 sees the same damage, and their inspection demands a report too. A minor issue can collect 3–5 reports before anyone gets to it.

The fix: before a driver may file a new report, show them **every open report on that bleacher** and let them tick the ones that describe what they are looking at ("select all that apply"). A new report is created only when none of the open ones match.

Three entry points into one and the same flow:

1. **Inspection** — after `Have you found damage? → Yes`;
2. **Damage Reports screen** — after `+`, once a bleacher is selected;
3. **Trips** — a `View Damage Reports` button under `View Pickup Inspection` (viewing only, no selection).

## 2. The core decision: an acknowledgement is a database row

The original idea was "write nothing". Rejected, for three reasons:

1. The inspection says `damage found = yes` while no report is attached → the `DamageCard` in `inspectionSummaryWidget` is empty. That reads as a lost report.
2. The manager would see **nothing** — just fewer reports. What they actually need is the signal "three drivers confirmed this, most recently Sep 8": that is both prioritisation and evidence that it is still broken.
3. Audit: no record that the driver saw it, and none that the damage existed at the time of the trip. That matters most on a dropoff inspection.

So we write a **lightweight ack row** (no photos, no severity, no notes) into a new table. From the driver's point of view the behaviour is exactly what was asked for: no new damage report is created.

## 3. Decisions already made

| # | Decision |
|---|----------|
| 1 | The `DamageReportAcknowledgements` table is accepted. |
| 2 | The bleacher selector on the **All** tab lists every bleacher with at least one open report (company-wide). On **Mine**, only bleachers with open reports this driver created. |
| 3 | The checklist shows the **whole** list, no pagination (realistically 4–5 reports per bleacher). Card: severity + note excerpt + date + author + a thumbnail strip. Tapping a card opens the read-only view. |
| 4 | An inspection with `damage = yes` **cannot** be submitted until at least one existing report is selected **or** a new report is filled in. |
| 5 | Both tabs show **unresolved only**. |
| 6 | Selecting a report with `fixed_by_driver = true` clears it back to `false` (and nulls `fixed_at`, `fixed_by_user_uuid`): the driver is looking at the damage right now. |
| 7 | Read-only viewing of another driver's report is allowed for any driver (as is the `Fixed` button from Spec A). |

## 4. What already works, and what not to build

`br_powersync/config/sync_rules.yaml:357` already ships **every** `DamageReports` row with `resolved_at IS NULL` to **every** phone, company-wide, along with their `DamageReportPhotos` via the mirrored `report_resolved_at` column. `DamageReportPhotos.thumbnail` is a ~10KB base64 string, so **previews of other drivers' photos work offline**. This spec needs no new syncing to "show a driver other people's reports".

What is *not* available offline: **full-size** photos of other drivers' reports — the attachment queue only downloads your own. In the read-only viewer, full size opens from the bucket, and offline we show the thumbnail plus a *"Full-size photo needs a connection"* note. The screen is never blocked.

## 5. Data model

`bleacher_rentals/supabase/migrations/2026MMDDHHMMSS_damage_report_acknowledgements.sql`:

```sql
create table if not exists public."DamageReportAcknowledgements" (
  id                        uuid        not null default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  damage_report_uuid        uuid        not null,
  inspection_uuid           uuid,            -- NULL when acked from the Damage Reports screen
  work_tracker_uuid         uuid,            -- the trip it was seen on, when there is one
  acknowledged_by_user_uuid uuid        not null,
  deleted                   boolean     not null default false,
  -- Mirror of the parent's resolved_at — see §6 for why this is NOT a join.
  report_resolved_at        timestamptz,
  constraint damage_report_acks_pkey primary key (id),
  constraint damage_report_acks_report_fkey
    foreign key (damage_report_uuid) references public."DamageReports" (id) on delete cascade,
  constraint damage_report_acks_inspection_fkey
    foreign key (inspection_uuid) references public."WorkTrackerInspections" (id) on delete set null,
  constraint damage_report_acks_work_tracker_fkey
    foreign key (work_tracker_uuid) references public."WorkTrackers" (id) on delete set null,
  constraint damage_report_acks_user_fkey
    foreign key (acknowledged_by_user_uuid) references public."Users" (id)
);

create index if not exists "DamageReportAcks_report_idx"
  on public."DamageReportAcknowledgements" (damage_report_uuid);
create index if not exists "DamageReportAcks_user_idx"
  on public."DamageReportAcknowledgements" (acknowledged_by_user_uuid);

-- One ack per (report, inspection): re-submitting an inspection never multiplies rows.
create unique index if not exists "DamageReportAcks_report_inspection_uniq"
  on public."DamageReportAcknowledgements" (damage_report_uuid, inspection_uuid)
  where inspection_uuid is not null and deleted = false;
```

Plus the triggers that maintain `report_resolved_at` — an **exact copy** of the pattern in `20260902120000_damage_report_photos_report_resolved_at.sql` (on ack insert, and on `DamageReports.resolved_at` updates).

Mobile schema — a new table in `AppSchema.ts`, `indexes: { damage_report_uuid, acknowledged_by_user_uuid }`, `created_at`/`report_resolved_at` as `column.text`, `deleted` as `column.integer`.

## 6. Sync rules (`br_powersync`)

```yaml
# Acks on open reports — needed to show "confirmed by N drivers" and to let a
# driver see they already confirmed this one.
- SELECT * FROM "DamageReportAcknowledgements" WHERE connection.parameter('app') = 'mobile' AND "report_resolved_at" IS NULL
```

**Do not join to `DamageReports`.** That exact join already broke first sync: it compiles into a parameter query with one row per open report and hits the 1000-row cap (`PSYNC_S2305`, see the comment at `sync_rules.yaml:361-375`). The mirrored column is therefore a required part of the migration, not an optimisation.

Volume: ~100 bytes per row, no photos. Even 5000 acks is half a megabyte per device.

Web (`is_viewer` / AccountManagers / admin sections) — add the table to all three rule sets, exactly as `DamageReports` is.

Deploying sync rules means a restart. Batch it with the one already pending for Driver Satisfaction.

## 7. Mobile

### 7.1 Data

- `hooks/db/useDamageReportAcknowledgements.ts`:
  - `useAckCounts(reportIds)` → `Record<reportId, number>` (`group by damage_report_uuid`), cross-driver with a written reason;
  - `useAcksForInspection(inspectionUuid)`;
- `features/damage-report/utils/acknowledgeDamageReports.ts`:
  ```
  acknowledgeDamageReports({ reportIds, inspectionUuid, workTrackerUuid, scope })
  ```
  one `executeTypedTransaction`: inserts the ack rows **and**, for every selected report with `fixed_by_driver = 1`, clears `fixed_by_driver/fixed_at/fixed_by_user_uuid` (decision 6). Clearing another driver's report is again a cross-driver write, through Spec A's `crossDriverWrite` (§5.1) with its own reason.
- `useAnyDamageReportById(reportId)` in `hooks/db/useDamageReport.ts` — a cross-driver twin of the scoped `useDamageReportById`, wrapped in `crossDriverRead` with a reason. **The scoped hook stays untouched**: it is what decides which photos may be retried or replaced.

### 7.2 The shared checklist component

`components/widgets/ExistingDamageChecklist.tsx` — global, because three or more features use it (the CLAUDE.md rule).

```
props: bleacherUuid, selectedIds, onToggle, onOpenReport, mode: "select" | "view"
```

The card moves into `components/widgets/DamageReportCard.tsx`, because the Damage Reports screen wants the same card:

- severity badge (the worse of `seat_damage`/`haul_damage`) — the existing `worstSeverity` logic moves out of `DamageReportHistoryScreen` into a shared util;
- `note` over two lines via `numberOfLines`;
- date and author name;
- a horizontal thumbnail strip (base64, works offline);
- a `Fixed` badge when `fixed_by_driver = 1`;
- a `Confirmed by N drivers` line when N > 0;
- a checkbox in `select` mode; the "open" chevron always.

No pagination (decision 3); `FlatList`/`FlashList` with a memoised item component and stable callbacks (the `list-performance-*` rules).

### 7.3 Read-only viewer

- route `app/damage-report-view.tsx` → `features/damage-report/DamageReportViewScreen.tsx`, param `damageReportId`;
- data: `useAnyDamageReportById` + `useDamageReportPhotoPaths` (already cross-driver);
- **absent**: editing, `EditablePhotoGrid`, Retry/Replace, `DebugUploadTracker`;
- **present**: severity, note, date, author, photos (thumbnail offline / full size online), `Confirmed by N`, Spec A's `Mark as Fixed` / `Unmark Fixed`, and `Done`.

### 7.4 Inspection

[components/widgets/inspection.tsx](../../components/widgets/inspection.tsx):

- when `damageFound === true`, render `ExistingDamageChecklist` for the inspection's bleacher above the new-report form;
- below the checklist, a `Do you need to file a new report?` `Yes / No` toggle. `Yes` reveals the existing form (`DamageDetailsForm` + `EditablePhotoGrid`);
- new validation (`validate()`, currently ~line 406):
  - `damageFound === null` → unchanged;
  - `damageFound === true`, `selectedIds.length === 0`, and no new report being filled in → **"Select an existing damage report or file a new one"**;
  - when a new report is enabled, the current requirements (note + at least one photo) still apply;
  - when existing reports are selected and no new one is filed, note and photos are **not** required;
- the submit sequence in `handleSubmit` (~468–630) gains one step: `WorkTrackerInspections` → (optionally) the new damage report → **acks** → the `WorkTrackers` link. Acks come after the inspection row because they need its `inspection_uuid`;
- `damageFound: true` in the payload is unchanged, whether this was an ack or a new report.

### 7.5 Trips

[components/widgets/trip_item.tsx](../../components/widgets/trip_item.tsx): under `View Pickup Inspection` and under `View Dropoff Inspection`, a `View Damage Reports (N)` button, where N is `damageReports.length` (the `useDamageReports` hook is already called there, line 136). Hidden when N = 0. It opens a bottom sheet listing the cards in `view` mode → tap → the read-only screen.

### 7.6 Damage Reports screen

`features/damage-report/DamageReportHistoryScreen.tsx` (the route stays `app/(drawer)/(tabs)/damage-report-history.tsx`) splits into:

```
features/damage-report-list/
├── DamageReportListScreen.tsx        # tabs + selector + FAB
├── components/DamageReportTabs.tsx
├── components/BleacherFilterSelect.tsx
└── hooks/useBleachersWithOpenReports.ts   # { all, mine }
```

- **tabs**: `All` / `Mine`. Both filtered to `resolved_at IS NULL` (decision 5);
- **bleacher selector** on each tab, searchable (reuse `components/widgets/bleacherDropdown.tsx`), fed by `useBleachersWithOpenReports`: distinct `bleacher_uuid` from open reports (for `Mine`, also `created_by_user_uuid = me`), names via `useBatchBleachers`. Default option `All bleachers`;
- **the `+` FAB**:
  - no bleacher selected → ask for the bleacher first;
  - bleacher selected → a bottom sheet with `ExistingDamageChecklist` in `select` mode and two actions: `Confirm selected (N)` → `acknowledgeDamageReports({ inspectionUuid: null, workTrackerUuid: null })` → toast *"Confirmed — no new report created"*; and `None of these — file a new report` → the current `/damage-report` with the bleacher prefilled;
  - bleacher has no open reports → straight to `/damage-report`.

**A regression to close deliberately:** decision 5 hides your own **resolved** reports from the `Mine` tab, where they used to appear. That is accepted. But your own report whose photos have not finished uploading must not vanish — so the `Mine` filter is `resolved_at IS NULL` **OR** the report has a photo with an unfinished upload (`PhotoUploadStatus`). Otherwise the only route to Retry/Replace disappears with the row.

## 8. Web (`bleacher_rentals`)

Without this part the manager sees no difference — and the difference is the whole success metric.

- `DamageReportModal`: a `Confirmed by N drivers` block listing "name · date · (inspection / standalone)";
- `page.tsx`: on an open report's card, the confirmation count and the latest date; optionally a "most confirmed first" sort;
- types: regenerate `database.types.ts`.

## 9. Tests (written FIRST; never edited once green)

1. `acknowledgeDamageReports` writes one row per selected report with the right `inspection_uuid` / `work_tracker_uuid` / `acknowledged_by_user_uuid`.
2. The same call twice for one inspection creates no duplicates (unique index / upsert logic).
3. Acking a report with `fixed_by_driver = 1` clears all three fixed columns; a report with `0` is left untouched.
4. The ack and the fixed-clear happen **in one transaction** (no partial state is reachable).
5. The compiled ack SQL does not filter on `created_by_user_uuid` and is wrapped in `crossDriverWrite` with a non-empty reason.
6. `useBleachersWithOpenReports`: `all` includes other drivers' bleachers; `mine` only bleachers with my own open reports.
7. Both tabs drop rows with `resolved_at`; the `Mine` tab **keeps** an own resolved report whose photo upload is unfinished.
8. `ExistingDamageChecklist`: renders every open report for the bleacher; toggling adds/removes the id; tapping the card calls `onOpenReport`, not toggle.
9. Inspection validation: `damage = yes` + zero selected + no new report → error; at least one selected and no new report → valid, note and photos not required; new report enabled → current requirements apply.
10. Submitting an inspection with selections and no new report: no `DamageReports` row, N ack rows, `damageFound = true` in the payload.
11. Submitting with a new report **and** selections: both the report and the acks are written.
12. `useAnyDamageReportById` returns another driver's report; the scoped `useDamageReportById` returns `null` for the same id.
13. The read-only screen renders no Retry/Replace and no editing.
14. `trip_item`: the `View Damage Reports (N)` button appears when N > 0 and is absent when N = 0.
15. Web e2e: a report with two acks shows `Confirmed by 2 drivers` with the names.

## 10. PR breakdown

Each PR gets its own entry in `features/changelog/entries.json` plus a `version` bump (the CLAUDE.md rule, enforced by CI).

1. **Schema + data**: migration, mirror triggers, sync rules, `AppSchema`, hooks, `acknowledgeDamageReports`, `useAnyDamageReportById`. No UI.
2. **Shared UI**: `DamageReportCard`, `ExistingDamageChecklist`, the read-only screen and its route; the button in `trip_item`.
3. **Inspection**: the checklist in the yes branch, the new validation, acks in submit.
4. **Damage Reports screen**: tabs, bleacher selector, the gate on `+`.
5. **Web**: showing acknowledgements.

## 11. Risks

- **A driver ticks "same as that one" to avoid work.** An ack row carrying their name and a timestamp makes that visible — which is precisely why we write one instead of writing nothing.
- **Someone else's damage looks like new damage.** Mitigated by thumbnails and the note right on the checklist card; and filing a new report is never blocked.
- **Deploy order**: the sync rules will serve the ack table before old builds know about it, which is safe (unknown tables are ignored). The reverse is not: the mobile build must not ship before the sync rules deploy, or the checklist is empty and acks go nowhere.
