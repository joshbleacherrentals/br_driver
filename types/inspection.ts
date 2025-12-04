/**
 * Inspection data that matches the WorkTrackerInspections table schema
 */
export interface InspectionData {
  is_bleacher_clean: boolean;
  is_sticker_condition_good: boolean;
  is_spare_tire_present: boolean;
  is_tire_condition_good: boolean;
  is_safety_chain_condition_good: boolean;
  are_safety_chains_attached: boolean;
  are_safety_pins_attached: boolean;
  are_lights_in_place: boolean;
  are_lights_functioning: boolean;
  is_cylinder_sleeve_in_place: boolean;
  opens_closes_smoothly: boolean;
  e_brake_pin_works: boolean;
  electric_trailer_brake_works: boolean;
  all_spindles_present: boolean;
  locking_tabs_present: boolean;
  handrails_present: boolean;
  any_broken_parts: boolean;
  overall_rating: number; // 1-5
  notes: string;
}

/**
 * WorkTrackerInspection from database (includes ID and timestamp)
 */
export interface WorkTrackerInspection extends InspectionData {
  inspection_id: number;
  created_at: string;
}
