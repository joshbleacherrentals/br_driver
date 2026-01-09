import { AttachmentTable } from "@powersync/attachments";
import { column, Schema, Table } from "@powersync/react-native";

export const INSPECTION_TABLE = "Inspections";
export const WORK_TRACKER_TABLE = "workTrackers";

export const LIST_TABLE = "lists";

// create table
//   public.lists (
//     id uuid not null default gen_random_uuid (),
//     created_at timestamp with time zone not null default now(),
//     name text not null,
//     constraint lists_pkey primary key (id)
//   ) tablespace pg_default;

const lists = new Table({
  created_at: column.text,
  name: column.text,
});

// inspection

const Inspections = new Table(
  {
    inspection_id: column.text,
    created_at: column.text,
    walk_around_complete: column.integer,
    issues_found: column.integer,
    issue_description: column.text,
    inspection_photos__table_id: column.text,
  },
  { indexes: { list: ["inspection_id"] } }
);

const InspectionPhotos = new Table(
  {
    storage_path: column.text,
    inspection_id: column.text,
  },
  { indexes: { inspection: ["inspection_id"] } }
);

// worktracker

const workTracker = new Table(
  {
    work_tracker_id: column.text,
    created_at: column.text,
    user_id: column.text,
    date: column.text,
    pickup_time: column.text,
    pickup_address_id: column.text,
    pickup_poc: column.text,
    dropoff_time: column.text,
    dropoff_address_id: column.text,
    dropoff_poc: column.text,
    pay_cents: column.text,
    notes: column.text,
    bleacher_id: column.text,
    internal_notes: column.text,
    status: column.text,
    released_at: column.text,
    accepted_at: column.text,
    started_at: column.text,
    completed_at: column.text,
    updated_at: column.text,
    pre_inspection_id: column.text,
    post_inspection_id: column.text,
  },
  { indexes: { list: ["work_tracker_id"] } }
);

// user

// driver

export const AppSchema = new Schema({
  Inspections,
  InspectionPhotos,
  workTracker,
  lists,
  attachments: new AttachmentTable({
    name: "attachments",
  }),
});

export type Database = (typeof AppSchema)["types"];
export type InspectionTable = Database["Inspections"];
export type ListRecord = Database["lists"];
export type InspectionPhotosTable = Database["InspectionPhotos"];
