import { AttachmentTable } from '@powersync/attachments';
import { column, Schema, Table } from '@powersync/react-native';

export const INSPECTION_TABLE = 'Inspections';
export const WORK_TRACKER_TABLE = 'workTrackers';

// inspection

const Inspections = new Table(
    {
        inspection_id: column.text,
        walk_around_complete: column.integer,
        mandatory_photo_id: column.text,
        issues_found: column.integer,
        issue_description: column.text,
        optional_photo_ids: column.text,
    },
    { indexes: {list: ['inspection_id']} }
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
        post_inspection_id: column.text
    },
    { indexes: {list: ['work_tracker_id']} }
)

// user

// driver

export const AppSchema = new Schema({
    Inspections,
    workTracker,
    attachments: new AttachmentTable({
        name: 'attachments',
    }),
});

export type Database = (typeof AppSchema)['types']
export type InspectionTable = Database['Inspections']