import { AttachmentTable } from "@powersync/attachments";
import { column, Schema, Table } from "@powersync/react-native";
import { PowerSyncColsFor } from "./types";

export const USERS_TABLE = "Users";
export const DRIVERS_TABLE = "Drivers";
export const INSPECTION_TABLE = "WorkTrackerInspections";
export const WORK_TRACKER_TABLE = "WorkTrackers";
export const PHOTO_TABLE = "InspectionPhotos";

export const DRIVER_DOC_ATTACHMENT_TABLE = "driver_doc_attachments";
export const DAMAGE_PHOTO_ATTACHMENT_TABLE = "damage_photo_attachments";

// users
const UsersCols = {
  first_name: column.text,
  last_name: column.text,
  email: column.text,
  phone: column.text,
  clerk_user_id: column.text,
  status_uuid: column.text,
  role: column.integer,
  avatar_image_url: column.text,
  is_admin: column.integer,
  is_viewer: column.integer,
  created_at: column.text,
  expo_push_token: column.text,
  changelog_last_read_at: column.text,
  inspection_queue_last_seen_at: column.text,
} satisfies PowerSyncColsFor<"Users">;
const Users = new Table(UsersCols, {
  // `clerk_user_id` is the entry point of the Clerk → Users → Drivers lookup
  // every driver-scoped query starts from (photo queue §15, useDriver, …).
  indexes: {
    status_uuid: ["status_uuid"],
    clerk_user_id: ["clerk_user_id"],
  },
});

const DriverAvailabilityCols = {
  driver_uuid: column.text,
  date_unavailable: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"DriverUnavailability">;
const DriverAvailability = new Table(DriverAvailabilityCols, {
  indexes: { driver_uuid: ["driver_uuid"] },
});

const AccountManagerCols = {
  created_at: column.text,
  is_active: column.integer,
  user_uuid: column.text,
} satisfies PowerSyncColsFor<"AccountManagers">;
const AccountManagers = new Table(AccountManagerCols, {
  indexes: { id: ["id"] },
});

// drivers
const DriversCols = {
  account_manager_uuid: column.text,
  address_uuid: column.text,
  app_platform: column.text,
  app_version: column.text,
  app_version_reported_at: column.text,
  created_at: column.text,
  deadhead_cents: column.integer,
  insurance_expires_on: column.text,
  insurance_photo_path: column.text,
  is_active: column.integer,
  license_expires_on: column.text,
  license_photo_path: column.text,
  medical_card_expires_on: column.text,
  medical_card_photo_path: column.text,
  pay_currency: column.text,
  pay_per_unit: column.text,
  pay_rate_cents: column.integer,
  phone_number: column.text,
  setup_cents: column.integer,
  /** @deprecated Whole-percent mirror of `tax_dec`, kept for older builds of this app. */
  tax: column.integer,
  /** Tax rate in percent with 3 decimals (Quebec is 14.975). Postgres `numeric` -> SQLite real. */
  tax_dec: column.real,
  teardown_cents: column.integer,
  user_uuid: column.text,
  vehicle_uuid: column.text,
  vendor_uuid: column.text,
} satisfies PowerSyncColsFor<"Drivers">;
const Drivers = new Table(DriversCols, {
  indexes: { user_uuid: ["user_uuid"] },
});

const DriverUnavailabilityCols = {
  driver_uuid: column.text,
  date_unavailable: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"DriverUnavailability">;
const DriverUnavailability = new Table(DriverUnavailabilityCols, {
  indexes: { driver_uuid: ["driver_uuid"] },
});

// tiered pay rates: min/max distance range -> rate, per driver
const DriverPayRangesCols = {
  driver_uuid: column.text,
  min_value: column.integer,
  max_value: column.integer,
  rate: column.real,
  created_at: column.text,
} satisfies PowerSyncColsFor<"DriverPayRanges">;
const DriverPayRanges = new Table(DriverPayRangesCols, {
  indexes: { driver_uuid: ["driver_uuid"] },
});

// addresses
const AddressCols = {
  created_at: column.text,
  street: column.text,
  city: column.text,
  state_province: column.text,
  zip_postal: column.text,
  // The rest of a full postal address plus its geocode. `street` alone stopped
  // being the whole address — every display goes through formatAddress().
  country: column.text,
  latitude: column.real,
  longitude: column.real,
  place_id: column.text,
} satisfies PowerSyncColsFor<"Addresses">;
const Addresses = new Table(AddressCols, { indexes: { id: ["id"] } });

// bleachers
const BleacherCols = {
  created_at: column.text,
  bleacher_number: column.text,
  bleacher_rows: column.integer,
  bleacher_seats: column.integer,
  created_by: column.text,
  updated_at: column.text,
  updated_by: column.text,
  linxup_device_id: column.text,
  summer_account_manager_uuid: column.text,
  winter_account_manager_uuid: column.text,
  summer_home_base_uuid: column.text,
  winter_home_base_uuid: column.text,
  hitch_type: column.text,
  vin_number: column.text,
  tag_number: column.text,
  manufacturer: column.text,
  height_folded_ft: column.integer,
  trailer_length: column.integer,
  gvwr: column.integer,
  opening_direction: column.text,
  deleted: column.integer,
  trailer_length_in: column.integer,
  trailer_height_in: column.integer,
  nvis_pdf_path: column.text,
  zone_uuid: column.text,
  bleacher_type_uuid: column.text,
  storage_location_uuid: column.text,
} satisfies PowerSyncColsFor<"Bleachers">;
const Bleachers = new Table(BleacherCols, { indexes: { id: ["id"] } });

// inspection questions
const InspectionQuestionsCols = {
  question_text: column.text,
  required: column.integer,
  question_type: column.text,
  is_active: column.integer,
  sort_order: column.integer,
} satisfies PowerSyncColsFor<"InspectionQuestions">;
const InspectionQuestions = new Table(InspectionQuestionsCols, {
  indexes: { id: ["id"] },
});

// inspection
const WorkTrackerInspectionsCols = {
  created_at: column.text,
  walk_around_complete: column.integer,
  issues_found: column.integer,
  issue_description: column.text,
  answers_json: column.text,
  // Which bleacher this inspection actually covered. Inspection rows are
  // immutable, so this survives a later correction of the work tracker.
  bleacher_uuid: column.text,
} satisfies PowerSyncColsFor<"WorkTrackerInspections">;
const WorkTrackerInspections = new Table(WorkTrackerInspectionsCols, {
  indexes: { id: ["id"] },
});

// damage reports
//
// `satisfies Partial<...>` rather than the full mapping: `photos_uploaded` is
// server-derived (Postgres triggers only, see
// bleacher_rentals/supabase/migrations/20260820120000_damage_reports_photos_uploaded.sql)
// and no client — this one included — ever writes it, so it is deliberately
// not declared here. `Partial` still checks every column that IS declared, so
// a typo'd name or a text/integer mix-up is still caught exactly as before;
// only "you listed all of them" is relaxed.
const DamageReportsCols = {
  inspection_uuid: column.text,
  bleacher_uuid: column.text,
  is_safe_to_sit: column.integer,
  is_safe_to_haul: column.integer,
  seat_damage: column.text,
  haul_damage: column.text,
  note: column.text,
  created_at: column.text,
  resolved_at: column.text,
  maintenance_event_uuid: column.text,
  created_by_user_uuid: column.text,
  deleted: column.integer,
  // "Fixed by driver" — a driver's claim that the damage is gone. Not a
  // resolve: a manager still closes the report on the web, which is what drops
  // it off every phone. Three columns because "fixed" without "who" and "when"
  // is a question a manager asks immediately, and Postgres refuses the
  // half-filled state outright (CHECK constraint in
  // 20260909120000_damage_reports_fixed_by_driver.sql).
  fixed_by_driver: column.integer,
  fixed_at: column.text,
  fixed_by_user_uuid: column.text,
} satisfies Partial<PowerSyncColsFor<"DamageReports">>;
const DamageReports = new Table(DamageReportsCols, {
  // `created_by_user_uuid` backs the photo queue's ownership subquery (§15) and
  // the "my damage reports" history screen.
  indexes: {
    bleacher_uuid: ["bleacher_uuid"],
    created_by_user_uuid: ["created_by_user_uuid"],
  },
});

// damage report photos
//
// The *churning* §3 queue columns (`attempts`, `last_attempt_at`, `last_error`,
// `gallery_asset_id`) are deliberately NOT declared here — they live on the
// local-only `PhotoUploadStatus` table below, which is what keeps a drain of
// hundreds of photos out of PowerSync's `ps_crud` outbox. See its comment.
//
// `upload_status` is the one exception, and it is a deliberate hybrid rather
// than a half-finished move. A photo row syncs to the server the moment it is
// created — long before its file finishes uploading — so "the row is in
// Postgres" never meant "the photo is in the bucket". `upload_status` was, and
// remains, the only server-visible signal that an upload actually completed:
// it is what a human checks in Postgres to confirm a report's photos landed,
// and what the `DamageReports.photos_uploaded` gate reads (server-computed —
// see the Partial<> comment on `DamageReportsCols` above).
//
// What makes keeping it affordable is that the client writes it exactly ONCE
// per photo, and only ever the value `uploaded`
// (`runtime/syncedUploadStatusMirror.ts`). Intermediate states — pending,
// uploading, failed, every retry — stay entirely in `PhotoUploadStatus` and
// never reach the outbox. So the outbox sees one entry per photo *ever*,
// instead of one per photo per attempt, and every read the client's own queue
// logic performs still comes from the local-only table.
//
// `satisfies Partial<...>` rather than the full mapping used by every synced
// table above: the Postgres table still has the local-only columns too, so the
// exhaustive form would demand them back. `Partial` still checks every column
// that IS declared — a typo'd name or a text/integer mix-up is caught exactly
// as before; only "you listed all of them" is relaxed.
const DamageReportPhotosCols = {
  damage_report_uuid: column.text,
  photo_path: column.text,
  thumbnail: column.text,
  created_at: column.text,
  // Server-visible upload completion only — see above. Never written with any
  // value other than `uploaded`, and never read by the client's queue logic.
  upload_status: column.text,
} satisfies Partial<PowerSyncColsFor<"DamageReportPhotos">>;
const DamageReportPhotos = new Table(DamageReportPhotosCols, {
  indexes: { damage_report_uuid: ["damage_report_uuid"] },
});

// damage report acknowledgements — "select all that apply"
//
// A driver confirming that an existing report describes what they are looking
// at, written INSTEAD of a duplicate report. Light by design: no photos, no
// severity, no note — the report it points at already carries all of that.
//
// Cross-driver, like the reports themselves: the count a driver sees
// ("confirmed by 3 drivers") is what stops them filing a fourth report, so
// acks on every open report reach every phone.
//
// `report_resolved_at` is a mirror of the parent's `resolved_at`, maintained
// by Postgres triggers, and it is the column the mobile sync rule filters on.
// Not an optimisation: reaching the parent through a JOIN there compiles into
// a parameter query capped at 1000 rows, which is how first sync broke once
// already (see the comment in `br_powersync/config/sync_rules.yaml`).
const DamageReportAcknowledgementsCols = {
  damage_report_uuid: column.text,
  inspection_uuid: column.text,
  work_tracker_uuid: column.text,
  acknowledged_by_user_uuid: column.text,
  created_at: column.text,
  deleted: column.integer,
  report_resolved_at: column.text,
} satisfies Partial<PowerSyncColsFor<"DamageReportAcknowledgements">>;
const DamageReportAcknowledgements = new Table(
  DamageReportAcknowledgementsCols,
  {
    indexes: {
      damage_report_uuid: ["damage_report_uuid"],
      acknowledged_by_user_uuid: ["acknowledged_by_user_uuid"],
    },
  },
);

/**
 * §3 upload bookkeeping, keyed by the photo row's own `id` — LOCAL ONLY.
 *
 * WHY THIS TABLE EXISTS
 * `upload_status`/`attempts`/`last_attempt_at`/`last_error`/`gallery_asset_id`
 * are device bookkeeping: the server has no use for the *churn*, only for the
 * final outcome (mirrored once per photo onto the synced row — see
 * `DamageReportPhotosCols` above). While they all sat on the synced
 * `DamageReportPhotos` table, every status transition of every
 * photo became one more entry in PowerSync's `ps_crud` outbox — and PowerSync
 * will not apply an incoming checkpoint while `ps_crud` is non-empty. Draining a
 * few hundred photos therefore held off *every* server update the driver was
 * waiting on (trip status, new assignments) for as long as the drain lasted.
 * A `localOnly` table is written straight to `ps_data_local__PhotoUploadStatus`
 * with no CRUD entry at all, so the queue's own chatter can no longer starve the
 * driver's real data.
 *
 * `id` IS the photo row's id (uuids, so unique across photo tables), which keeps
 * the join to the photo row a plain equality and needs no second key column.
 *
 * A MISSING ROW IS NOT AN ERROR. Every read left-joins and coalesces a missing
 * row to "fresh and pending" (`library/photoUploadQueue/runtime/tableAdapters.ts`),
 * which is what makes an upgrade from the old schema safe in the only direction
 * that matters: an in-flight photo is re-attempted rather than silently dropped.
 *
 * No `satisfies PowerSyncColsFor<...>`: that helper pins a table against its
 * Supabase counterpart, and this table deliberately has none.
 */
export const PHOTO_UPLOAD_STATUS_TABLE = "PhotoUploadStatus";
const PhotoUploadStatusCols = {
  upload_status: column.text,
  gallery_asset_id: column.text,
  attempts: column.integer,
  last_attempt_at: column.text,
  last_error: column.text,
};
const PhotoUploadStatus = new Table(PhotoUploadStatusCols, {
  localOnly: true,
  // The queue's hot predicates: "still unresolved" and "due for a retry".
  indexes: {
    upload_status: ["upload_status"],
    last_attempt_at: ["last_attempt_at"],
  },
});

// inspectionPhotos
const InspectionsPhotosCols = {
  created_at: column.text,
  inspection_uuid: column.text,
  storage_path: column.text,
  caption: column.text,
  // Custom photo upload queue (design doc §3) — InspectionPhotos previously had
  // no upload_status at all.
  upload_status: column.text,
  gallery_asset_id: column.text,
  attempts: column.integer,
  last_attempt_at: column.text,
  last_error: column.text,
} satisfies PowerSyncColsFor<"InspectionPhotos">;
const InspectionPhotos = new Table(InspectionsPhotosCols, {
  // `inspection_uuid` is both the per-inspection photo lookup and the correlated
  // column of the photo queue's ownership subquery (§15).
  indexes: { id: ["id"], inspection_uuid: ["inspection_uuid"] },
});

// driver documents (license / insurance / medical card) — one row per document,
// same custom-upload-queue shape as the photo tables (design doc §3).
const DriverDocumentsCols = {
  driver_uuid: column.text,
  doc_type: column.text,
  photo_path: column.text,
  upload_status: column.text,
  gallery_asset_id: column.text,
  attempts: column.integer,
  last_attempt_at: column.text,
  last_error: column.text,
  created_at: column.text,
} satisfies PowerSyncColsFor<"DriverDocuments">;
const DriverDocuments = new Table(DriverDocumentsCols, {
  indexes: { driver_uuid: ["driver_uuid"] },
});

// worktracker
const WorkTrackersCols = {
  created_at: column.text,
  updated_at: column.text,
  date: column.text,
  pickup_time: column.text,
  pickup_poc: column.text,
  dropoff_time: column.text,
  dropoff_poc: column.text,
  pay_cents: column.integer,
  notes: column.text,
  internal_notes: column.text,
  pickup_address_uuid: column.text,
  dropoff_address_uuid: column.text,
  bleacher_uuid: column.text,
  driver_uuid: column.text,
  user_uuid: column.text,
  status: column.text,
  released_at: column.text,
  accepted_at: column.text,
  started_at: column.text,
  completed_at: column.text,
  // When the driver handed the work back — one column per kind of withdrawal,
  // so "never took it on" and "walked away mid-job" stay distinguishable.
  declined_at: column.text,
  abandoned_at: column.text,
  pre_inspection_uuid: column.text,
  post_inspection_uuid: column.text,
  teardown_required: column.integer,
  pickup_instructions: column.text,
  setup_required: column.integer,
  dropoff_instructions: column.text,
  pickup_poc_contact_uuid: column.text,
  dropoff_poc_contact_uuid: column.text,
  bol_number: column.text,
  project_number: column.text,
  worktracker_group_uuid: column.text,
  work_tracker_type_uuid: column.text,
  distance_meters: column.integer,
  drive_minutes: column.integer,
  created_by_user_uuid: column.text,
  // The bleacher the driver confirmed taking. Null until an inspection is
  // submitted — null is "not confirmed yet", never "same as bleacher_uuid",
  // which is written explicitly. Read through getEffectiveBleacherUuid().
  actual_bleacher_uuid: column.text,
  bleacher_change_reason: column.text,
  // Structured time — the source of truth behind the free-text `pickup_time` /
  // `dropoff_time` mirrors a Postgres trigger keeps in step. Read these and
  // format in the app (utils/workTrackerTime.ts); the text columns are only a
  // fallback for rows saved before the migration.
  pickup_time_mode: column.text,
  pickup_time_start: column.text,
  pickup_time_end: column.text,
  dropoff_time_mode: column.text,
  dropoff_time_start: column.text,
  dropoff_time_end: column.text,
} satisfies PowerSyncColsFor<"WorkTrackers">;
const WorkTrackers = new Table(WorkTrackersCols, {
  // The two inspection columns are the OR-chain the photo queue walks to decide
  // whether an InspectionPhotos row belongs to this driver (§15).
  indexes: {
    user_uuid: ["user_uuid"],
    driver_uuid: ["driver_uuid"],
    pre_inspection_uuid: ["pre_inspection_uuid"],
    post_inspection_uuid: ["post_inspection_uuid"],
  },
});

// Contacts — the on-site POC an office user attaches to a trip leg.
//
// Only the contacts referenced by this driver's own WorkTrackers sync here
// (see the mobile stream in br_powersync/config/sync_rules.yaml); the wider
// customer contact book never reaches a device.
const ContactsCols = {
  first_name: column.text,
  last_name: column.text,
  phone: column.text,
  email: column.text,
  company_uuid: column.text,
  notes: column.text,
  deleted: column.integer,
  created_at: column.text,
  created_by_user_uuid: column.text,
  preferred_language: column.text,
} satisfies PowerSyncColsFor<"Contacts">;
const Contacts = new Table(ContactsCols);

// WorkTracker line items — the pay breakdown behind WorkTrackers.pay_cents.
// One row per billable line (hauling, deadhead, setup, …); `unit_amt_cents`
// times `qty_decimal` is that line's total.
const WorkTrackerLineItemsCols = {
  work_tracker_uuid: column.text,
  type: column.text,
  /** DEPRECATED - whole-unit mirror of qty_decimal, maintained by a Postgres trigger. */
  quantity: column.integer,
  /** SQLite has no DECIMAL; PowerSync casts the Postgres numeric(10,1) into a real. */
  qty_decimal: column.real,
  unit_amt_cents: column.integer,
  description: column.text,
  is_automatically_managed: column.integer,
  created_at: column.text,
} satisfies PowerSyncColsFor<"WorkTrackerLineItems">;
// What kind of work a tracker is: a Trip, a Repair / Maintenance visit, or a
// Site Visit / Cleaning / Other. A tiny reference table (single digits of
// rows) that ships whole to every phone — read it through `code`, never the
// row's uuid or its `display_name`, both of which office users can change.
const WorkTrackerTypesCols = {
  display_name: column.text,
  code: column.text,
  sort_order: column.integer,
  is_deleted: column.integer,
  created_at: column.text,
} satisfies PowerSyncColsFor<"WorkTrackerTypes">;
const WorkTrackerTypes = new Table(WorkTrackerTypesCols, {
  indexes: { id: ["id"] },
});

const WorkTrackerLineItems = new Table(WorkTrackerLineItemsCols, {
  indexes: { work_tracker_uuid: ["work_tracker_uuid"] },
});

// Vehicles
const VehiclesCols = {
  created_at: column.text,
  make: column.text,
  model: column.text,
  year: column.integer,
  vin_number: column.text,
} satisfies PowerSyncColsFor<"Vehicles">;
const Vehicles = new Table(VehiclesCols, { indexes: { id: ["id"] } });

// BlueBook
const BlueBookCols = {
  name: column.text,
  link: column.text,
  description: column.text,
  is_active: column.integer,
  region: column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
  document_path: column.text,
} satisfies PowerSyncColsFor<"BlueBook">;
const BlueBook = new Table(BlueBookCols, { indexes: { id: ["id"] } });

// App store version gate policy (one row per environment)
const AppVersionPolicyCols = {
  environment: column.text,
  recommended_version: column.text,
  required_version: column.text,
  soft_deadline: column.text,
  ios_store_url: column.text,
  android_store_url: column.text,
  message: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"AppVersionPolicy">;
const AppVersionPolicy = new Table(AppVersionPolicyCols, {
  indexes: { environment: ["environment"] },
});

// Backlog tickets a driver files straight to the developers ("Direct Line to
// Developers"). `RoadmapTasks` is the *whole* developer roadmap in Postgres —
// features, sprints, assignees — but only a driver's own `is_backlog` rows ever
// reach a phone (see the mobile stream in br_powersync/config/sync_rules.yaml).
//
// `satisfies Partial<...>` for the same reason `DamageReports` uses it: the
// roadmap-side columns (`sprint_id`, `feature_id`, `developer_uuid`,
// `completed_at`) are the web app's business and no driver device reads or
// writes them, so declaring them would only widen what syncs. Every column that
// IS declared is still checked against database.types.ts.
//
// `deleted_at` is declared and soft-deleted rows deliberately keep syncing to
// the device: the daily create limit counts tickets *created*, withdrawn ones
// included, and the count has to match the Postgres trigger exactly (see
// utils/dailyTicketLimit.ts). The list query filters them out instead.
const RoadmapTasksCols = {
  title: column.text,
  description: column.text,
  status: column.text,
  sort_order: column.integer,
  is_backlog: column.integer,
  created_by_user_uuid: column.text,
  created_at: column.text,
  deleted_at: column.text,
} satisfies Partial<PowerSyncColsFor<"RoadmapTasks">>;
const RoadmapTasks = new Table(RoadmapTasksCols, {
  // Every read on this table starts from "the tickets this driver wrote".
  indexes: { created_by_user_uuid: ["created_by_user_uuid"] },
});

// The message thread the developers read on a roadmap task. A phone writes into
// it and never reads it back: the notices that say which driver filed, edited
// or withdrew a ticket (see features/backlog-tickets/utils/ticketNoticeInsert.ts),
// each posted in the same transaction as the change it describes.
//
// What syncs back down is only this driver's own `is_system` notices, and only
// on their own backlog tickets (mobile stream in br_powersync/config/
// sync_rules.yaml). Not because anything on the device reads them — nothing
// does — but so the local database holds what Postgres actually accepted
// instead of writes that vanish at the next checkpoint. The rest of the thread
// is the developers' conversation, and drivers are deliberately never shown
// ticket status; a reply reaching a phone with no UI for it would promise an
// answer the product does not make.
const RoadmapTaskMessagesCols = {
  task_id: column.text,
  user_uuid: column.text,
  body: column.text,
  // Postgres boolean, mirrored as 0/1. Always 1 from a phone: the notice is
  // written by the app, not typed by the driver, and the board renders system
  // messages as notes rather than as somebody's reply.
  is_system: column.integer,
  created_at: column.text,
} satisfies Partial<PowerSyncColsFor<"RoadmapTaskMessages">>;
const RoadmapTaskMessages = new Table(RoadmapTaskMessagesCols, {
  indexes: { task_id: ["task_id"] },
});

// ── Driver Satisfaction Score ───────────────────────────────────────────────
//
// The survey a driver cannot dismiss. Definitions (survey + questions) are
// reference data: small, synced in full while active, and read on the device so
// the question can be asked with no connection at all. The wording lives in
// Postgres rather than in this bundle precisely so it can change without an App
// Store release.
const DriverSurveysCols = {
  title: column.text,
  // How long after a submission the same driver is asked again — 30 today, 7
  // from next quarter. A column, not a constant in a mobile build.
  interval_days: column.integer,
  is_active: column.integer,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"DriverSurveys">;
const DriverSurveys = new Table(DriverSurveysCols, {
  indexes: { is_active: ["is_active"] },
});

const DriverSurveyQuestionsCols = {
  survey_uuid: column.text,
  prompt: column.text,
  kind: column.text,
  // At or below this score the written reason becomes mandatory. Read from the
  // row and never hardcoded — see features/driver-survey/utils/surveyValidation.ts.
  follow_up_max_score: column.integer,
  follow_up_prompt: column.text,
  is_required: column.integer,
  is_active: column.integer,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"DriverSurveyQuestions">;
const DriverSurveyQuestions = new Table(DriverSurveyQuestionsCols, {
  indexes: { survey_uuid: ["survey_uuid"] },
});

// One row per question answered — there is no submission parent table, by
// design (see the migration header in bleacher_rentals). `submission_uuid`
// groups the rows written together, and everything about the submission lives
// on the row, so one answer is one local write that crosses the sync boundary
// alone: nothing to sequence, nothing to orphan.
//
// This table IS the app's memory of when it last asked: the gate compares
// `max(submitted_at)` against the survey's interval. Nothing here is ever
// pruned on the device, and the mobile sync rule deliberately carries no date
// filter — a driver whose last answer fell outside a narrowed window would be
// asked again every morning.
const DriverSurveyResponsesCols = {
  submission_uuid: column.text,
  survey_uuid: column.text,
  question_uuid: column.text,
  driver_uuid: column.text,
  user_uuid: column.text,
  score: column.integer,
  reason_text: column.text,
  // The wording the driver was actually shown. Questions become editable in the
  // web app next quarter; without this copy, every historical answer would be
  // silently re-labelled with a question nobody was asked.
  prompt_snapshot: column.text,
  submitted_at: column.text,
  app_version: column.text,
  app_platform: column.text,
  created_at: column.text,
} satisfies PowerSyncColsFor<"DriverSurveyResponses">;
const DriverSurveyResponses = new Table(DriverSurveyResponsesCols, {
  indexes: { driver_uuid: ["driver_uuid", "survey_uuid"] },
});

export const AppSchema = new Schema({
  Users,
  Drivers,
  DriverUnavailability,
  DriverPayRanges,
  Bleachers,
  Addresses,
  AccountManagers,
  WorkTrackerInspections,
  InspectionQuestions,
  DamageReports,
  DamageReportPhotos,
  DamageReportAcknowledgements,
  PhotoUploadStatus,
  InspectionPhotos,
  DriverDocuments,
  WorkTrackers,
  WorkTrackerLineItems,
  WorkTrackerTypes,
  Contacts,
  Vehicles,
  BlueBook,
  AppVersionPolicy,
  RoadmapTasks,
  RoadmapTaskMessages,
  DriverSurveys,
  DriverSurveyQuestions,
  DriverSurveyResponses,
  [DRIVER_DOC_ATTACHMENT_TABLE]: new AttachmentTable({
    name: DRIVER_DOC_ATTACHMENT_TABLE,
  }),
  [DAMAGE_PHOTO_ATTACHMENT_TABLE]: new AttachmentTable({
    name: DAMAGE_PHOTO_ATTACHMENT_TABLE,
  }),
});

export type PowerSyncDB = (typeof AppSchema)["types"];
export type DriverRecord = PowerSyncDB["Drivers"];
export type UserRecord = PowerSyncDB["Users"];
export type BleacherRecord = PowerSyncDB["Bleachers"];
export type InspectionsRecord = PowerSyncDB["WorkTrackerInspections"];
export type InspectionPhotosRecord = PowerSyncDB["InspectionPhotos"];
export type DamageReportPhotosRecord = PowerSyncDB["DamageReportPhotos"];
export type DriverDocumentsRecord = PowerSyncDB["DriverDocuments"];
export type WorkTrackerRecord = PowerSyncDB["WorkTrackers"];
export type WorkTrackerLineItemRecord = PowerSyncDB["WorkTrackerLineItems"];
export type WorkTrackerTypeRecord = PowerSyncDB["WorkTrackerTypes"];
export type ContactRecord = PowerSyncDB["Contacts"];
export type RoadmapTaskRecord = PowerSyncDB["RoadmapTasks"];
export type RoadmapTaskMessageRecord = PowerSyncDB["RoadmapTaskMessages"];
export type AddressRecord = PowerSyncDB["Addresses"];
export type AccountManagerRecord = PowerSyncDB["AccountManagers"];
export type DriverSurveyRecord = PowerSyncDB["DriverSurveys"];
export type DriverSurveyQuestionRecord = PowerSyncDB["DriverSurveyQuestions"];
export type DriverSurveyResponseRecord = PowerSyncDB["DriverSurveyResponses"];
