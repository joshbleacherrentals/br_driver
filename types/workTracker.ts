import { Database } from "@/database.types";

export type WorkTrackerStatus = Database["public"]["Enums"]["worktracker_status"];

export interface WorkTracker {
  work_tracker_id: number;
  created_at: string;
  updated_at: string;
  user_id: number | null;
  driver_id: number | null;
  date: string | null;
  pickup_time: string | null;
  pickup_address_id: number | null;
  pickup_poc: string | null;
  dropoff_time: string | null;
  dropoff_address_id: number | null;
  dropoff_poc: string | null;
  pay_cents: number | null;
  notes: string | null;
  internal_notes: string | null;
  bleacher_id: number | null;
  status: WorkTrackerStatus;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  released_at: string | null;
  pre_inspection_id: number | null;
  post_inspection_id: number | null;
  legend_state_uuid: string | null;
  pickup_address_uuid: string | null;
  dropoff_address_uuid: string | null;
  deleted: boolean;
}

export interface Address {
  address_id: number;
  street: string;
  city: string;
  state_province: string;
  zip_postal: string | null;
}

export interface Bleacher {
  bleacher_id: number;
  bleacher_number: number;
}

export interface EnrichedWorkTracker extends WorkTracker {
  pickup_address?: Address;
  dropoff_address?: Address;
  bleacher?: Bleacher;
}
