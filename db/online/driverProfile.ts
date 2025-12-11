import { DriverWithDetails } from "@/types/driver";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get driver profile with vehicle and address details by Clerk user ID
 */
export async function getDriverProfile(
  supabase: SupabaseClient,
  clerkUserId: string
): Promise<DriverWithDetails | null> {
  console.log("Fetching driver profile for Clerk user ID:", clerkUserId);

  // First, get the user_id from Users table using clerk_user_id
  const { data: userData, error: userError } = await supabase
    .from("Users")
    .select("user_id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError || !userData) {
    console.log("User not found for Clerk ID:", clerkUserId, userError);
    return null;
  }

  console.log("Found user_id:", userData.user_id);

  // Now get the driver profile using user_id
  const { data, error } = await supabase
    .from("Drivers")
    .select(
      `
      *,
      vehicle:Vehicles(vehicle_id, make, model, year, vin_number),
      address:Addresses(address_id, street, city, state_province, zip_postal)
    `
    )
    .eq("user_id", userData.user_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      console.log("Driver profile not found for user_id:", userData.user_id);
      return null; // Not found
    }
    throw error;
  }
  console.log("Fetched driver profile:", data);
  return data as DriverWithDetails;
}

/**
 * Create or update vehicle
 */
export async function upsertVehicle(
  supabase: SupabaseClient,
  vehicleData: {
    vehicle_id?: number;
    make: string;
    model: string;
    year: number;
    vin_number?: string | null;
  }
): Promise<number> {
  if (vehicleData.vehicle_id) {
    // Update existing vehicle
    const { error } = await supabase
      .from("Vehicles")
      .update({
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year,
        vin_number: vehicleData.vin_number || null,
      })
      .eq("vehicle_id", vehicleData.vehicle_id);

    if (error) throw error;
    return vehicleData.vehicle_id;
  } else {
    // Create new vehicle
    const { data, error } = await supabase
      .from("Vehicles")
      .insert({
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year,
        vin_number: vehicleData.vin_number || null,
      })
      .select("vehicle_id")
      .single();

    if (error) throw error;
    return data.vehicle_id;
  }
}

/**
 * Create or update address
 */
export async function upsertAddress(
  supabase: SupabaseClient,
  addressData: {
    address_id?: number;
    street: string;
    city: string;
    state_province: string;
    zip_postal?: string | null;
  }
): Promise<number> {
  if (addressData.address_id) {
    // Update existing address
    const { error } = await supabase
      .from("Addresses")
      .update({
        street: addressData.street,
        city: addressData.city,
        state_province: addressData.state_province,
        zip_postal: addressData.zip_postal || null,
      })
      .eq("address_id", addressData.address_id);

    if (error) throw error;
    return addressData.address_id;
  } else {
    // Create new address
    const { data, error } = await supabase
      .from("Addresses")
      .insert({
        street: addressData.street,
        city: addressData.city,
        state_province: addressData.state_province,
        zip_postal: addressData.zip_postal || null,
      })
      .select("address_id")
      .single();

    if (error) throw error;
    return data.address_id;
  }
}

/**
 * Update driver profile
 */
export async function updateDriverProfile(
  supabase: SupabaseClient,
  driverId: number,
  updates: {
    phone_number?: string | null;
    address_id?: number | null;
    vehicle_id?: number | null;
    license_photo_path?: string | null;
    insurance_photo_path?: string | null;
    medical_card_photo_path?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("Drivers").update(updates).eq("driver_id", driverId);

  if (error) throw error;
}

/**
 * Upload driver document to Supabase Storage
 */
export async function uploadDriverDocument(
  supabase: SupabaseClient,
  userId: number,
  fileUri: string,
  documentType: "license" | "insurance" | "medical_card"
): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const extension = fileUri.split(".").pop()?.toLowerCase() || "jpg";
  const filename = `${documentType}-${timestamp}-${random}.${extension}`;
  const storagePath = `drivers/${userId}/${filename}`;

  // Read the file
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  // Determine content type
  const contentTypeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    pdf: "application/pdf",
  };
  const contentType = contentTypeMap[extension] || "image/jpeg";

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("driver-documents")
    .upload(storagePath, fileData, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload document: ${uploadError.message}`);
  }

  return storagePath;
}

/**
 * Delete driver document from Supabase Storage
 */
export async function deleteDriverDocument(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  const { error } = await supabase.storage.from("driver-documents").remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

/**
 * Get public URL for driver document
 */
export function getDriverDocumentUrl(supabase: SupabaseClient, storagePath: string): string {
  const { data } = supabase.storage.from("driver-documents").getPublicUrl(storagePath);
  return data.publicUrl;
}
