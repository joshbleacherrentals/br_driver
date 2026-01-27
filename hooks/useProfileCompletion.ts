import { useMemo } from 'react';
import { fetchDriver } from '@/db/fetchDrivers';

/**
 * Hook to check if driver profile is complete
 * Returns true if all 6 required fields are populated
 */
export function useProfileCompletion() {
  const { driver } = fetchDriver();

  const isProfileComplete = useMemo(() => {
    if (!driver) return false;

    // Define the 6 required fields to check
    const requiredFields = [
      driver.phone_number,
      driver.address_uuid,
      driver.vehicle_uuid,
      driver.license_photo_path,
      driver.insurance_photo_path,
      driver.medical_card_photo_path,
    ];

    // Check if all required fields are populated (not null/undefined/empty)
    return requiredFields.every(field => {
      if (field === null || field === undefined) return false;
      if (typeof field === 'string' && field.trim() === '') return false;
      return true;
    });
  }, [driver]);

  // Get list of missing fields for helpful messaging
  const missingFields = useMemo(() => {
    if (!driver) return [];

    const fields: { name: string; value: any }[] = [
      { name: 'Phone Number', value: driver.phone_number },
      { name: 'Address', value: driver.address_uuid },
      { name: 'Vehicle', value: driver.vehicle_uuid },
      { name: "Driver's License", value: driver.license_photo_path },
      { name: 'Insurance', value: driver.insurance_photo_path },
      { name: 'Medical Card', value: driver.medical_card_photo_path },
    ];

    return fields
      .filter(field => {
        if (field.value === null || field.value === undefined) return true;
        if (typeof field.value === 'string' && field.value.trim() === '') return true;
        return false;
      })
      .map(field => field.name);
  }, [driver]);

  return {
    isProfileComplete,
    missingFields,
    driver,
  };
}