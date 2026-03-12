import { AttachmentTable } from "@powersync/attachments";
import { column, Schema, Table } from "@powersync/react-native";
import { PowerSyncColsFor } from "./types";

export const USERS_TABLE = "Users";
export const DRIVERS_TABLE = "Drivers";
export const INSPECTION_TABLE = "WorkTrackerInspections";
export const WORK_TRACKER_TABLE = "WorkTrackers";
export const PHOTO_TABLE = "InspectionPhotos"


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
  expo_push_token: column.text,
  created_at: column.text,
} satisfies PowerSyncColsFor<"Users">;
const Users = new Table(UsersCols, { indexes: { status_uuid: ["status_uuid"] } });

const AccountManagerCols = {
  created_at: column.text,
  is_active: column.integer,
  user_uuid: column.text
} satisfies PowerSyncColsFor<"AccountManagers">;
const AccountManagers = new Table(AccountManagerCols, {indexes: { id: ["id"]}});

// drivers
const DriversCols = {
  account_manager_uuid: column.text,
  address_uuid: column.text,
  created_at: column.text,
  insurance_photo_path: column.text,
  is_active: column.integer,
  license_photo_path: column.text,
  medical_card_photo_path: column.text,
  pay_currency: column.text,
  pay_per_unit: column.text,
  pay_rate_cents: column.integer,
  phone_number: column.text,
  tax: column.integer,
  user_uuid: column.text,
  vehicle_uuid: column.text,
  vendor_uuid: column.text,
} satisfies PowerSyncColsFor<"Drivers">;
const Drivers = new Table(DriversCols, { indexes: { user_uuid: ["user_uuid"] } });

// addresses
const AddressCols = {
  created_at: column.text,
  street: column.text,
  city: column.text,
  state_province: column.text,
  zip_postal: column.text,
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
  gvwr: column.integer,
} satisfies PowerSyncColsFor<"Bleachers">;
const Bleachers = new Table(BleacherCols, { indexes: { id: ["id"] } });

// inspection
const WorkTrackerInspectionsCols = {
  created_at: column.text,
  walk_around_complete: column.integer,
  issues_found: column.integer,
  issue_description: column.text
} satisfies PowerSyncColsFor<"WorkTrackerInspections">
const WorkTrackerInspections = new Table(WorkTrackerInspectionsCols, { indexes: { id: ["id"] } });

// inspectionPhotos
const InspectionsPhotosCols = {
  created_at: column.text,
  inspection_uuid: column.text,
  storage_path: column.text,
  caption: column.text
} satisfies PowerSyncColsFor<"InspectionPhotos">
const InspectionPhotos = new Table(InspectionsPhotosCols, { indexes: { id: ["id"] } });

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

  pre_inspection_uuid: column.text,
  post_inspection_uuid: column.text,

  teardown_required: column.integer,
  pickup_instructions: column.text,
  setup_required: column.integer,
  dropoff_instructions: column.text,
  project_number: column.text,
  bol_number: column.text,

  worktracker_group_uuid: column.text,
  work_tracker_type_uuid: column.text,
  distance_meters: column.integer,
  drive_minutes: column.integer
  } satisfies PowerSyncColsFor<"WorkTrackers">;
const WorkTrackers = new Table(WorkTrackersCols, {
  indexes: { user_uuid: ["user_uuid"], driver_uuid: ["driver_uuid"] },
});

// Vehicles
const VehiclesCols = {
  created_at: column.text,
  make: column.text,
  model: column.text,
  year: column.integer,
  vin_number: column.text,
} satisfies PowerSyncColsFor<"Vehicles">
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
} satisfies PowerSyncColsFor<"BlueBook">
const BlueBook = new Table(BlueBookCols, { indexes: { id: ["id"] } });


export const AppSchema = new Schema({
  Users,
  Drivers,
  Bleachers,
  Addresses,
  AccountManagers,
  WorkTrackerInspections,
  InspectionPhotos,
  WorkTrackers,
  Vehicles,
  BlueBook,
  attachments: new AttachmentTable({
    name: "attachments",
  }),
});

export type PowerSyncDB = (typeof AppSchema)["types"];
export type DriverRecord = PowerSyncDB["Drivers"];
export type UserRecord = PowerSyncDB["Users"];
export type BleacherRecord = PowerSyncDB["Bleachers"];
export type InspectionsRecord = PowerSyncDB["WorkTrackerInspections"];
export type InspectionPhotosRecord = PowerSyncDB["InspectionPhotos"];
export type WorkTrackerRecord = PowerSyncDB["WorkTrackers"];
export type AddressRecord = PowerSyncDB["Addresses"];
export type AccountManagerRecord = PowerSyncDB["AccountManagers"];

export const ATTACHMENT_TABLE = "attachments";
