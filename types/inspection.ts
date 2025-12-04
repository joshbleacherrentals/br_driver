/**
 * Pre-trip inspection checklist
 * Performed before starting a trip to verify bleacher and vehicle condition
 */
export interface PreTripInspection {
  // Bleacher condition
  bleacherDamage: boolean;
  bleacherDamageNotes?: string;
  bleacherCleanliness: "clean" | "dirty" | "damaged";
  bleacherCleanlinessNotes?: string;

  // Vehicle condition
  vehicleCondition: "good" | "issues" | "critical";
  vehicleConditionNotes?: string;

  // Tire check
  tiresChecked: boolean;
  tireIssues?: string;

  // Lights and signals
  lightsWorking: boolean;
  lightsIssues?: string;

  // Photos
  photos?: string[]; // Array of photo URIs or base64 strings

  // Metadata
  timestamp: string; // ISO timestamp
  location?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Post-trip inspection checklist
 * Performed after completing a trip to document final bleacher condition
 */
export interface PostTripInspection {
  // Bleacher condition
  bleacherDamage: boolean;
  bleacherDamageNotes?: string;
  bleacherCleanliness: "clean" | "dirty" | "damaged";
  bleacherCleanlinessNotes?: string;

  // Delivery confirmation
  deliveredSuccessfully: boolean;
  deliveryIssues?: string;

  // Customer signature
  customerSignature?: string; // Base64 image of signature
  customerName?: string;

  // Photos
  photos?: string[]; // Array of photo URIs or base64 strings

  // Metadata
  timestamp: string; // ISO timestamp
  location?: {
    latitude: number;
    longitude: number;
  };
}
