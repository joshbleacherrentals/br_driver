# Spec A — "Fixed by driver" on damage reports

> Status: spec, not yet implemented.
> Repositories: `br_driver` (mobile), `bleacher_rentals` (web + migration), `br_powersync` (sync rules — likely unchanged, see §4).
> Order: **this spec goes first**, before [damage-report-dedupe.md](damage-report-dedupe.md) (Spec B) — B's report card has to render the `Fixed` badge already, and B's checklist clears this flag.

## 1. The task

A driver who physically fixed a small piece of damage has no way to say so. The report stays open until a manager creates a maintenance event, and every driver after them keeps seeing it.

What we add:

- **mobile** — on a single damage report screen, next to `Done`, a `Mark as Fixed` button → confirmation → `fixed_by_driver = true`;
- the report **does not disappear** from any list — it gets a `Fixed` badge (mobile and web);
- **web** — on a report with `fixed_by_driver = true`, a `Mark as Resolved` button appears next to `Create Maintenance to Resolve`; it simply sets `resolved_at = now()`. The report leaves every phone and moves from Open to Resolved on the web;
- the `Fixed` mark can be removed from both mobile and web (tapped by accident).

A side effect that matters: `sync_rules.yaml` ships **every** `DamageReports` row with `resolved_at IS NULL` to **every** phone, company-wide. The comment next to that rule records that at 1018 open reports every driver's first sync failed with `PSYNC_S2305`. Every report closed through this flow shrinks that set — so this is a performance task too.

## 2. Decisions already made

| # | Decision |
|---|----------|
| 1 | Three columns written together: `fixed_by_driver`, `fixed_at`, `fixed_by_user_uuid`. A bare bool loses "who and when", which is the first thing a manager asks for. |
| 2 | **Any driver** can mark a report fixed, not only its author. Whoever was on site is the one who fixed it. |
| 3 | Any driver, and any web user with access to the report, can remove the mark. |
| 4 | Removing the mark clears all three columns (`false / null / null`); a CHECK constraint holds the invariant. We keep no history of who pressed what — if an audit trail is ever needed, that is a separate log table, not a half-filled row. |
| 5 | `Mark as Resolved` exists **only on the web** and **only** for `fixed_by_driver = true AND resolved_at IS NULL`. It creates no maintenance event and never touches `maintenance_event_uuid`. |

## 3. Data model

`bleacher_rentals/supabase/migrations/2026MMDDHHMMSS_damage_reports_fixed_by_driver.sql`:

```sql
alter table public."DamageReports"
  add column if not exists fixed_by_driver     boolean     not null default false,
  add column if not exists fixed_at            timestamptz,
  add column if not exists fixed_by_user_uuid  uuid;

alter table public."DamageReports"
  add constraint damage_reports_fixed_by_user_uuid_fkey
    foreign key (fixed_by_user_uuid) references public."Users" (id) on delete set null;

-- Three columns, one fact. A half-filled state ("fixed, but by nobody") means
-- nothing to a manager and must not be writable.
alter table public."DamageReports"
  add constraint damage_reports_fixed_consistent check (
    (    fixed_by_driver and fixed_at is not null and fixed_by_user_uuid is not null)
 or (not fixed_by_driver and fixed_at is     null and fixed_by_user_uuid is     null)
  );
```

Mobile schema — `library/powersync/AppSchema.ts`, inside `DamageReportsCols` (it is `satisfies Partial<...>`, so appending is enough):

```ts
fixed_by_driver: column.integer,   // SQLite: 0/1
fixed_at: column.text,
fixed_by_user_uuid: column.text,
```

Then `DAMAGE_REPORT_COLUMNS` and `DamageReportData` in [hooks/db/useDamageReport.ts](../../hooks/db/useDamageReport.ts).

## 4. Sync rules

The mobile rules read `SELECT * FROM "DamageReports" WHERE ... resolved_at IS NULL`, so the new columns come along on their own. **Verify on staging after the migration**: if PowerSync did not pick them up, redeploy the sync rules (restart). This spec needs no new rules of its own.

Older clients (without the new `AppSchema`) ignore unknown columns, so web and backend can ship before the mobile build is released.

## 5. Mobile

### 5.1 Mutation

New file `features/damage-report/utils/setDamageReportFixed.ts`:

```
markDamageReportFixed(reportId, scope)   → fixed_by_driver=1, fixed_at=now, fixed_by_user_uuid=scope.userUuid
unmarkDamageReportFixed(reportId)        → fixed_by_driver=0, fixed_at=null, fixed_by_user_uuid=null
```

via `executeTypedMutationVoid`.

**§15, and the main architectural point of this spec.** This is the first **cross-driver write** in the codebase: the query deliberately does **not** go through `damageReportsOf(scope)`, because the report may belong to another driver (decision 2). So that "an unscoped write" does not quietly become normal, add a twin of `crossDriverRead` to `library/powersync/scoping/scopedFrom.ts`:

```ts
export function crossDriverWrite<Q>(reason: string, query: Q): Q
```

— the same no-op wrapper with a mandatory written reason, so that `grep crossDriverWrite` enumerates **every** place a driver writes another driver's row. The reason here: "any driver who fixed the damage may mark it fixed — the one on site fixes it, not the one who filed the report".

### 5.1a The guard and the database's own writes

A fence that compares every column has one blind spot worth stating, because it
cost the upload queue once already: **not every write running under a driver's
JWT comes from the driver.**

The photo queue's ordinary `PATCH DamageReportPhotos SET upload_status =
'uploaded'` cascades through `trg_drp_photos_uploaded_upd` into
`UPDATE "DamageReports" SET photos_uploaded = …`, in the same session — and so
does the INSERT path when a report is created. `SECURITY DEFINER` on the
recompute function does not disguise it: that changes the executing role, not
the JWT, so `get_current_driver_id()` still answers "a driver", and the guard
saw a forbidden column move.

The blast radius is what makes this a section rather than a footnote: PowerSync
retries a rejected operation forever and does not move past it, so one
photo-status update stalls the driver's **entire** upload queue — every photo of
every report, silently, on a phone in the field.

The database therefore marks its own writes, for the length of the statement:

```sql
PERFORM set_config('app.server_write', 'on', true);   -- transaction-local
UPDATE public."DamageReports" ... ;
PERFORM set_config('app.server_write', 'off', true);
```

and the guard returns early while that marker is set. Any future server-side
writer to `DamageReports` that can run under a driver's JWT must do the same;
`grep app.server_write` finds the pattern. A client cannot set it: PostgREST
exposes only the `request.*` settings it derives from the JWT, and gives no
caller a way to run `set_config`.

The obvious alternative — excluding `photos_uploaded` from the comparison — was
rejected. It makes the fence depend on a hand-maintained list of server-derived
columns, so the next one added re-breaks the queue the same silent way, and it
hands a driver the one flag that decides whether a report's photo evidence
counts as delivered.

### 5.2 UI

[features/damage-report/DamageReportScreen.tsx](../../features/damage-report/DamageReportScreen.tsx), view mode (where `Done` currently sits alone, ~line 690):

- a two-button row: `Mark as Fixed` (secondary, green) + `Done`;
- when `fixed_by_driver = 1` it becomes `Unmark Fixed`, with a banner above the buttons: `Fixed by <name> · <date>` (`Fixed by you` for the current driver);
- confirmation is `Alert.alert` with `Yes / No` (matching every other confirmation on this screen), copy: *"Mark this damage report as fixed? Managers will still review it before it's closed."*; for removal: *"Remove the fixed mark from this report?"*;
- offline — the write goes to the local DB, the banner updates reactively, no network gate anywhere.

The name comes from `Users`/`Drivers` looked up by `fixed_by_user_uuid`; if that row is not on the device, show `Fixed · <date>` without a name rather than blocking the render.

### 5.3 Badge in lists

`Fixed` (a neutral green, visually distinct from `Resolved`) goes into:

- the cards on the Damage Reports screen ([DamageReportHistoryScreen.tsx](../../features/damage-report/DamageReportHistoryScreen.tsx));
- `components/widgets/inspectionSummaryWidget.tsx` → `DamageCard`;
- `components/widgets/bleacherDamageBadge.tsx` — **left alone**: it says "this bleacher has open damage", and a driver's mark does not change that fact.

### 5.4 The seam with Spec B

Today `useDamageReportById` is scoped to the author, so a report screen only opens for **your own** reports — meaning decision 2 is only half-delivered here: the button exists, but there is no route to another driver's report. Read-only viewing of another driver's report (from trips and from the All tab) arrives with Spec B and reuses **this exact** mutation unchanged. That is a deliberate seam, not an omission: neither spec has to wait for the other to be mergeable.

## 6. Web (`bleacher_rentals`)

`src/app/damage-reports/DamageReportModal.tsx`:

- inside the "Resolve via maintenance" block (`isEditing && !isReportResolved`), add a second button `Mark as Resolved` — **rendered only when `fixed_by_driver`**;
- click → confirm → `update({ resolved_at: new Date().toISOString() })`, leaving `maintenance_event_uuid` null;
- above the buttons, a `Fixed by <driver> on <date>` panel with a `Remove fixed mark` link (clears the three columns);
- `Create Maintenance to Resolve` stays exactly as it is, available regardless of `fixed_by_driver`.

`src/app/damage-reports/page.tsx`:

- a `Fixed` badge on the card in the Open tab;
- (optional, cheap) a "fixed first" sort or filter — that is a queue a manager can clear in two clicks.

Types: regenerate `database.types.ts` after the migration.

## 7. Tests (written FIRST; never edited once green)

Mobile (`jest`):

1. `setDamageReportFixed` — mark writes all three columns together; `fixed_by_user_uuid` equals `scope.userUuid`.
2. `setDamageReportFixed` — unmark clears all three; no leftover `fixed_at`.
3. The compiled mutation SQL contains **no** `created_by_user_uuid` filter (cross-driver write) and is wrapped in `crossDriverWrite` with a non-empty reason.
4. `useDamageReport*` return the new fields (types and values) for a row with `fixed_by_driver = 1`.
5. Report screen: `fixed_by_driver = 0` → `Mark as Fixed`; `= 1` → `Unmark Fixed` plus the dated banner.
6. Cancelling the `Alert` → no database write at all.
7. List: a row with `fixed_by_driver = 1` renders the `Fixed` badge, a row with `0` does not.

Web (playwright, next to `src/features/manageTeam/e2e/damage-reports.admin.spec.ts`):

8. `Mark as Resolved` is not rendered when `fixed_by_driver = false`.
9. `Mark as Resolved` with `fixed_by_driver = true` sets `resolved_at`, the report leaves Open and appears in Resolved, and `maintenance_event_uuid` stays null.
10. `Remove fixed mark` clears the three columns and hides `Mark as Resolved`.

SQL:

11. The CHECK constraint rejects `fixed_by_driver = true` with `fixed_at IS NULL`, and `false` with a non-null `fixed_at`.
12. A driver's `UPDATE DamageReportPhotos SET upload_status = 'uploaded'` succeeds, and `photos_uploaded` is recomputed (the queue-stalling regression, §5.1a).
13. The marker is not a standing exemption: in the same session, immediately after that write, the driver still cannot edit the report's note or set `photos_uploaded` itself.

## 8. Deploy order

1. Migration in `bleacher_rentals` + `database.types.ts`.
2. Verify sync rules on staging (§4); redeploy if needed.
3. Web.
4. Mobile PR: `AppSchema` + hooks + mutation + UI + badges. One PR, one entry in `features/changelog/entries.json`, `version` bumped in `package.json`.

## 9. Risks

- **A driver marks something fixed without fixing it.** Mitigation: this is not a resolve. The report stays open until a manager presses `Mark as Resolved`, and Spec B clears `fixed_by_driver` back to `false` the moment the next driver selects that report in the checklist (they are looking at the damage).
- **Race: driver removes the mark while a manager is resolving.** Last write wins, but `Mark as Resolved` is only reachable while `resolved_at IS NULL`, and an unmarked-fixed flag on an already-resolved report breaks nothing — the report stays resolved.
