# Spec — "Which other bleachers are coming?" (event roster on a trip card)

> Status: §1–§6 (heuristic event linking, app 1.11.0) implemented
> 2026-09-21, not deployed. §4 was **replaced** 2026-09-22 (still not
> deployed): the phone-side heuristic is gone, and `WorkTrackers` now carries
> its own `pickup_event_uuid` / `dropoff_event_uuid`, computed and kept
> current by Postgres. Touches all three repos: `bleacher_rentals`
> (migration), `br_powersync` (two new columns on the `FleetTrackers` rule),
> `br_driver` (`buildEventRoster`, `useEventRoster`, `resolveLegEvent`
> deleted). The web app's own UI is not touched — only the two new columns
> reach it, same as everything else on `WorkTrackers`.
>
> Before it works in production:
>
> 1. apply the migrations (`20260921130000_work_tracker_status_changed_at.sql`
>    then `20260922140000_work_tracker_event_links.sql`, in order),
> 2. restart the PowerSync service so the new rules load,
> 3. set `EXPO_PUBLIC_WEB_URL` to the deployed web app in each EAS build
>    profile — without it the Track button says tracking is unavailable,
> 4. ship a new native build (the rules are gated on `sync_version = 2`).

## 1. The problem

An event can have several bleachers, hauled by several drivers. When a driver
arrives, the organiser asks "when are the others coming?" — and the driver has
no way to answer. They can see their own tracker and nothing else.

Managers asked for: a list of the bleachers due at this event, each with the
status of the driver bringing it, and a GPS link where one exists.

## 2. What the driver sees

`PICKUP` and `DROP-OFF` on the trip card become tappable — the same
affordance as the pay amount (`PayAmount`): a pill when there is something to
open, plain text when there is not. Tapping opens a sheet listing, top to
bottom, every bleacher due at that leg's event, each with:

- bleacher number (and "you" on the driver's own row),
- what the driver bringing it is doing right now, plus how long ago that
  changed ("Loading the bleacher · 3:42 PM, 12 min ago"),
- a **Track** button when the bleacher has a `linxup_device_id`.

The same sheet opens from the Trip Details page in Trip History.

The two legs use **different events**, on purpose: at a pick up the driver is
asked when the rest will be collected, at a drop off when the rest will
arrive, and those are not the same event.

The labels are tappable only when the resolved event has **2 or more**
bleachers. One bleacher — or no event at all, e.g. a run to storage — leaves
them as plain text.

## 3. Statuses

| `WorkTrackers.status`                     | Shown to the driver             |
| ----------------------------------------- | ------------------------------- |
| `accepted`                                | Waiting for the driver to start |
| `dest_pickup`                             | On the way to pick it up        |
| `pickup_inspection`                       | Loading the bleacher            |
| `dest_dropoff`                            | On the way to drop it off       |
| `dropoff_inspection`                      | Unloading on site               |
| `completed`                               | Delivered                       |
| `released`, `declined`, `abandoned`, `cancelled`, `draft`, none | Ask the office for an update |

Each line also carries the time of that change, as clock time and as elapsed
minutes.

### `status_changed_at`

There is no column for when the status last changed. `accepted_at`,
`started_at`, `completed_at`, `declined_at` and `abandoned_at` cover only some
of the transitions, and `updated_at` moves on any office edit — a note or a
pay change would read as "the driver moved 2 minutes ago", which is exactly
the lie this feature exists to prevent.

So: a new `WorkTrackers.status_changed_at`, written by a Postgres trigger only
when `status` actually changes, backfilled from the timestamps above. The app
falls back to `updated_at` where it is NULL (rows not touched since the
migration).

## 4. Linking a tracker to an event — computed in Postgres

**Nothing records which event a tracker serves.** A tracker is created from a
dashboard cell (bleacher + date); its addresses are copies, not references to
the event's address.

### 4.1 History: the heuristic this replaced

The first cut (§1–§3 above, app 1.11.0) inferred the event on the phone: the
nearest booked event on the tracker's bleacher within a 14-day window, no
address check. Measured on the local database (1504 non-draft trackers),
"nearest booked event on this bleacher" matched **1484 of 1504** — including
runs to storage, whose next event was weeks away, because nothing about the
heuristic could tell a warehouse trip apart from a real delivery. On dev data
this misattributed roughly **35% of resolved rosters** to the wrong event —
good enough to ship as a first cut, not good enough to trust.

### 4.2 The columns

`WorkTrackers` gained two columns, computed and maintained entirely by
Postgres (the app never writes them):

- `dropoff_event_uuid` — the earliest booked, non-deleted event on the
  **assigned** bleacher (`bleacher_uuid`, never `actual_bleacher_uuid` — see
  §4.4) with `event_start >= tracker.date`, **whose address matches the
  tracker's `dropoff_address_uuid`** (§4.3).
- `pickup_event_uuid` — the latest such event with
  `coalesce(event_end, event_start) <= tracker.date`, address matched against
  `pickup_address_uuid`.
- No match → `NULL`. A run to storage has no event, full stop — there is no
  time window to fall into by accident.

The time-window heuristic is gone entirely: distance in time is no longer a
filter, only a tie-break among address-matching candidates (earliest for
drop-off, latest for pickup). Address matching is what actually distinguishes
"the event this trip serves" from "some other booking on the same bleacher,"
which a date window alone could never do.

### 4.3 Address matching ("rule #3")

Two addresses are the same place if **their ZIP/postal-code index matches**,
**or** their street text overlaps enough:

- **Index**: the first 5 lowercase alphanumeric characters of
  `Addresses.zip_postal`, only when both sides have one. This reads the ZIP
  column, not the street text — an early version of this rule mistakenly took
  the index from the address string itself, which made `"1561 Lake Shore Blvd
  W…"` and `"…E…"` collide on `"1561l"` (any two 4-digit-house-number
  addresses starting with the same letter collide within 5 characters,
  regardless of street). Reading `zip_postal` instead ties the index to an
  actual geographic signal.
- **Street words**: normalize each `street` value — lowercase, strip
  everything outside `[a-z0-9 ]`, split on whitespace — then drop stopwords
  (`st street ave avenue rd road dr drive blvd boulevard usa canada county
  regional municipality on lot unit of`). **Directions (`n s e w`, `north
  south east west`) are deliberately kept**: `1561 Lake Shore Blvd W` and
  `…E` must end up as different word sets, or they collide on every other
  shared word (`1561`, `lake`, `shore`, `toronto`) regardless of direction —
  see the known false positive below, where keeping directions is necessary
  but on its own not sufficient for that specific pair. Match when the
  Jaccard similarity of the two word sets is **≥ 0.34**.

A pair matches on index **or** words — either signal is enough.

**Calibrated against the dev database** (2026-09-22): `Addresses.latitude` /
`longitude` are hand-geocoded for the real events and trackers in the local
Supabase instance (not in `seed.sql`, lost on `db reset` — coordinates are a
calibration aid only, never used in the production rule). Ground truth:
distance < 200m = same place, > 5km = different place, city-level addresses
(e.g. `"Lockhart, TX"`) excluded. Against the actual runtime candidate set —
the nearest-in-time booked event per leg, 2524 pairs, exactly what §4.2 chooses
between:

| | true positives | false positives |
| --- | --- | --- |
| index alone | 72 | 12 |
| words alone | 30 | 12 |
| both | 1128 | 0 |
| **combined (index OR words)** | **1230 / 1238 = 99.35% recall** | **24 / 1053 = 2.28%** |

0.34 sits right at the knee of the precision/recall curve: 0.32 lets through
50 false positives for one extra true positive over 0.34; above 0.36 the false
positive count stops falling at all while recall keeps dropping. Two
independent measurements — this one and an earlier one over a different slice
of the same data — landed on the same threshold, so it is not overfit to one
sample.

**The two known false-positive classes, frozen into
`address_text_matches.test.sql` so a future threshold change surfaces exactly
what it moves:**

1. **Rural ZIP-index collision.** `Timmermans' Ranch and horse stables, Nixon
   Road, Simcoe, ON` and `1258 Turkey Point Rd, Simcoe, Norfolk County, ON` are
   11 km apart but share a ZIP prefix common to a wide rural area. Tightening
   to "index match AND at least one shared street word" does **not** fix
   this: the shared word that passes is `simcoe` — the city name, present in
   both regardless of which farm road it is. A real fix would need to drop
   city-name tokens from the word-overlap check specifically (not a
   generic stopword, since the same word is exactly what rescues address
   pairs that have nothing else — see below); that is a separate future
   measurement, not part of this change.
2. **Same street, different direction, otherwise identical.** `1561 Lake
   Shore Blvd W, Toronto` and `1561 Lake Shore Blvd E, Toronto` are 11 km
   apart with genuinely different ZIPs (`M6K 1J7` vs `M4L 3W6`, so the index
   correctly disagrees), but `1561`, `lake`, `shore` and `toronto` alone give
   a Jaccard of 0.44 — comfortably over 0.34 even though `w` ≠ `e`. Keeping
   directions un-stripped is still correct and necessary: dropping them (an
   earlier version of this rule did) would additionally collide on pairs
   like `17 First St W` / `17 First St East`, where direction is the *only*
   distinguishing word. It just isn't sufficient on its own when enough other
   words already carry the match past the threshold.

Both classes are accepted: on real data every false positive is a bounded,
explainable near-miss (an adjacent ZIP region or a genuinely similar address),
never an arbitrary distant event. At 2.28%, against a heuristic that
misattributed roughly 35% of rosters, this is not a matter of degree.

Implemented as (`bleacher_rentals/supabase/migrations/20260922140000_work_tracker_event_links.sql`):

- `public.normalize_street_words(text) returns text[]` — the stopword-stripped
  word set.
- `public.address_zip_index(text) returns text` — first 5 alnum characters of
  a ZIP, lowercased, `NULL` if empty.
- `public.address_text_matches(a_street text, a_zip text, b_street text, b_zip text) returns boolean`
  — rule #3, pure (no table reads); this is the pgTAP seam (S1).
- `public.addresses_match(a_id uuid, b_id uuid) returns boolean` — thin
  wrapper reading `street`/`zip_postal` for two `Addresses` rows and calling
  the function above.

### 4.4 Event selection for one tracker

- `public.resolve_work_tracker_dropoff_event(p_bleacher_uuid uuid, p_date date, p_address_uuid uuid) returns uuid`
- `public.resolve_work_tracker_pickup_event(p_bleacher_uuid uuid, p_date date, p_address_uuid uuid) returns uuid`

Both read booked, non-deleted events on the given bleacher via
`BleacherEvents`, keep the ones whose `address_uuid` matches
`p_address_uuid` via `addresses_match`, and pick the earliest
(`event_start >= p_date`, drop-off) or latest
(`coalesce(event_end, event_start) <= p_date`, pickup). `NULL` when nothing
matches — a run to storage.

Matching is on the **assigned** bleacher (`bleacher_uuid`) everywhere — the
event lookup, the roster, and the tracker query all agree on this.
`actual_bleacher_uuid` is the equivalent unit a driver grabbed when they could
not hitch the assigned one; it sits on a different event's calendar entirely,
so matching on it would answer the organiser about some other event. It is not
synced to the phone at all.

### 4.5 Keeping the columns current — triggers

Nothing in the app writes these columns; a chain of Postgres triggers keeps
them current as the underlying data changes.

| What changed | Who gets recomputed |
| --- | --- |
| `WorkTrackers`: `date`, `bleacher_uuid`, `pickup_address_uuid`, `dropoff_address_uuid` | this tracker (`BEFORE INSERT OR UPDATE`) |
| `Addresses`: `street`, `city`, `zip_postal` | trackers referencing it as pickup/dropoff directly, and trackers of bleachers whose *event* uses this address |
| `Events`: `event_start`, `event_end`, `event_status`, `deleted`, `address_uuid` | trackers of every bleacher booked into this event |
| `BleacherEvents`: insert / update / delete | trackers of that bleacher |

Same pattern as `work_tracker_history_snapshot` (`sync-bucket-limit.md`): the
`WorkTrackers` trigger is `BEFORE INSERT OR UPDATE` with no column list (a
status-only `UPDATE` still runs through `set_worktracker_status_timestamps`
first and would not otherwise be seen by a column-scoped trigger), and it only
reads `NEW`'s own columns — it never reaches out to `Addresses` or `Events`,
so the `AFTER` triggers on those tables cascading back into `WorkTrackers`
cannot recurse.

The migration also does a one-time recompute of every existing tracker.

### 4.6 What this replaced

`resolveLegEvent.ts` and `EVENT_LINK_WINDOW_DAYS` are deleted, and so is
their test. This is a deliberate tightening, not a like-for-like refactor: the
phone no longer guesses within a window when nothing matches — it shows plain
text, same as a run to storage always has. Anyone relying on the old
"nearest event within 14/31 days, no address check" behavior will see fewer
(but far more correct) rosters.

`buildEventRoster.ts` keeps its tie-break (closest tracker to the event wins,
live beats withdrawn) but stops calling `resolveLegEvent` per candidate —
`FleetTracker` now carries `pickupEventUuid` / `dropoffEventUuid` directly, so
a candidate belongs to the event by simple equality.

`useEventRoster.ts` loses its "own bleacher's calendar" and "siblings'
calendars" query stages entirely: the event is no longer inferred, it is read
straight off the tracker's own `pickup_event_uuid` / `dropoff_event_uuid`.
Its signature changes from `(leg, bleacherUuid, tripDate, myTrackerId)` to
`(leg, eventUuid, myTrackerId)` — callers (`StopRosterHeading` →
`TripStopSection`) pass the tracker's already-resolved event id instead of
bleacher + date.

### 4.7 Implementation notes (2026-09-22)

**`work_tracker_event_links_recompute` (the `WorkTrackers` BEFORE trigger)
must be `SECURITY DEFINER`.** It wasn't in the first pass, and every pgTAP
assertion above still passed — because pgTAP ran as the `postgres`
superuser, which ignores `GRANT`/`REVOKE` entirely. The gap only showed up
against the real web app: any `WorkTrackers` write (`INSERT` or `UPDATE`,
from either app) failed with `permission denied for function
resolve_work_tracker_dropoff_event`, because a non-`SECURITY DEFINER`
trigger still runs *every call it makes* as the invoking role, not just its
own firing — and `resolve_work_tracker_{pickup,dropoff}_event` /
`addresses_match` have `EXECUTE` revoked from `authenticated`/`anon` on
purpose (§4.3 — they are internal helpers, not an RPC). The four `AFTER`
cascade triggers were already `SECURITY DEFINER`; the `BEFORE` self-trigger
was the one missed.

The fix, and the regression test that would have caught it, both needed the
same thing pgTAP hadn't been doing: `SET LOCAL ROLE authenticated` plus a
simulated JWT (`driver_rls.test.sql`'s pattern), not just
`set_config('request.jwt.claims', …)` on its own under `postgres` — the
claim alone only affects what `auth.jwt()` returns for RLS `USING`/`CHECK`
clauses, not which role's grants get checked. `work_tracker_event_links.test.sql`'s
last two assertions now insert a `WorkTrackers` row as `authenticated` with an
admin JWT and confirm both that it doesn't error and that the trigger still
resolves the event correctly under that role — a template for any future
trigger on a table the web or driver app writes to directly.

## 5. Sync

Three new mobile rules, all **global** (no JOIN, so one bucket each — the
PSYNC_S2305 trap from `sync-bucket-limit.md` does not apply), all gated on
`sync_version = 2` so builds already on phones get nothing new:

| Rule                                        | Rows (local DB) | Why                            |
| ------------------------------------------- | --------------- | ------------------------------ |
| `Events` (id, name, start, end), booked only, not deleted | 661 | the event and its dates        |
| `BleacherEvents` (bleacher, event)          | 3821            | which bleachers are due        |
| `WorkTrackers` aliased as `FleetTrackers`   | 1600            | the other drivers' progress    |

`FleetTrackers` carries `bleacher_uuid` (the assigned one), `date`, `status`,
`status_changed_at`, `work_tracker_type_uuid`, and — since §4's server-side
event linking — `pickup_event_uuid` / `dropoff_event_uuid`, which is what lets
`useEventRoster` find a bleacher's serving tracker by simple equality instead
of re-resolving each candidate's event on the phone (§4.6). Pay, addresses,
notes and POC details of other drivers' trips never reach a phone. Drafts are
excluded.

A driver's own `WorkTrackers` rows already carry the two new columns through
the existing `*`-selected mobile rules — no rule change needed there, only
the `FleetTrackers` alias.

Output-table aliasing (`SELECT "F"."col" FROM "WorkTrackers" AS "F"`) is the
same technique the Sync Health page uses, and lets the driver's own full
`WorkTrackers` rows keep arriving unchanged in parallel.

## 6. GPS (Linxup)

Linxup has no public tracking link; the web app holds a secret token and reads
coordinates from its API (`/api/linxup/devices/{id}`). The driver app and the
web app are on the same Clerk instance, so the app calls that endpoint with
the driver's Clerk token and opens Google Maps at the returned point.

The token stays on the server. Putting it in the app would ship fleet-wide
location access inside the bundle.

This is the one part of the feature that needs network. Offline, the Track
button says so instead of failing silently.

The web app protects every non-public route with `clerkMiddleware` +
`auth.protect()` (`src/proxy.ts`), which accepts a Clerk session token in the
`Authorization` header as well as the browser cookie — so no web change is
needed. If a future middleware change breaks that, the fallback is a Supabase
edge function holding its own copy of the token.

## 7. Seams under test (agreed up front)

| #   | Seam                                             | Kind          |
| --- | ------------------------------------------------ | ------------- |
| ~~S1~~ | ~~`resolveLegEvent` — tracker + events → the event~~ (deleted, §4.6) | — |
| S2  | `buildEventRoster` — event → rows per bleacher, now matching on `pickupEventUuid`/`dropoffEventUuid` directly | pure, Jest |
| S3  | `describeFleetStatus` — status + time → the line  | pure, Jest    |
| S5  | `status_changed_at` trigger                       | pgTAP         |
| S6  | Linxup lookup + Google Maps URL                   | pure, Jest    |
| S7  | `address_text_matches` — street+zip pair → same place? (rule #3, §4.3) | pgTAP |
| S8  | `resolve_work_tracker_{pickup,dropoff}_event` — bleacher+date+address → the event (§4.4) | pgTAP |
| S9  | The event-link recompute triggers, one test per row of §4.5's table | pgTAP |

UI components are verified in the simulator, not in Jest (agreed).
