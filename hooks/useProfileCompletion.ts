import { useAddress } from "@/hooks/db/useAddress";
import { useDriver } from "@/hooks/db/useDriver";
import {
  areDocsValidOnDate,
  getExpiredDocNames,
  getExpiringSoonDocNames,
  getRequiredDocExpiries,
  isDocValidOnDate,
  todayISODate,
} from "@/utils/documentExpiry";
import { useCallback, useMemo } from "react";

/**
 * Hook to check if driver profile is complete and documents are valid.
 * Expired / missing expiry dates block trip acceptance (same as missing docs).
 */
export function useProfileCompletion() {
  const { driver } = useDriver();
  const { address } = useAddress(driver?.address_uuid ?? null);

  const hasDriver = driver !== null;
  const country = address?.street?.split(",").pop()?.trim();
  const isUSA = country === "USA";
  const today = todayISODate();

  const baseFieldsComplete = useMemo(() => {
    if (!driver) return false;

    const requiredFields = [
      driver.phone_number,
      driver.address_uuid,
      driver.vehicle_uuid,
      driver.license_photo_path,
      driver.insurance_photo_path,
      driver.license_expires_on,
      driver.insurance_expires_on,
      ...(isUSA
        ? [driver.medical_card_photo_path, driver.medical_card_expires_on]
        : []),
    ];

    return requiredFields.every((field) => {
      if (field === null || field === undefined) return false;
      if (typeof field === "string" && field.trim() === "") return false;
      return true;
    });
  }, [driver, isUSA]);

  const expiredDocumentNames = useMemo(() => {
    if (!driver) return [];
    return getExpiredDocNames(driver, isUSA, today);
  }, [driver, isUSA, today]);

  const expiringSoonDocumentNames = useMemo(() => {
    if (!driver) return [];
    return getExpiringSoonDocNames(driver, isUSA, today);
  }, [driver, isUSA, today]);

  const hasExpiredDocuments = expiredDocumentNames.length > 0;
  const hasExpiringSoonDocuments = expiringSoonDocumentNames.length > 0;

  // Complete only when all fields present AND nothing expired as of today
  const isProfileComplete = baseFieldsComplete && !hasExpiredDocuments;

  const missingFields = useMemo(() => {
    if (!driver) return [];

    const fields: { name: string; value: unknown }[] = [
      { name: "Phone Number", value: driver.phone_number },
      { name: "Address", value: driver.address_uuid },
      { name: "Vehicle", value: driver.vehicle_uuid },
      { name: "Driver's License", value: driver.license_photo_path },
      { name: "License Expiration", value: driver.license_expires_on },
      { name: "Insurance", value: driver.insurance_photo_path },
      { name: "Insurance Expiration", value: driver.insurance_expires_on },
      ...(isUSA
        ? [
            { name: "Medical Card", value: driver.medical_card_photo_path },
            {
              name: "Medical Card Expiration",
              value: driver.medical_card_expires_on,
            },
          ]
        : []),
    ];

    return fields
      .filter((field) => {
        if (field.value === null || field.value === undefined) return true;
        if (typeof field.value === "string" && field.value.trim() === "")
          return true;
        return false;
      })
      .map((field) => field.name);
  }, [driver, isUSA]);

  const canAcceptTripOnDate = useCallback(
    (tripDate: string | null | undefined) => {
      if (!driver || !isProfileComplete) return false;
      const date = tripDate?.trim() || today;
      return areDocsValidOnDate(driver, isUSA, date);
    },
    [driver, isProfileComplete, isUSA, today],
  );

  const getAcceptBlockReason = useCallback(
    (tripDate: string | null | undefined): string | null => {
      if (!driver) {
        return "Complete your profile before you can accept any trips";
      }
      if (!baseFieldsComplete) {
        return "Complete your profile before you can accept any trips";
      }
      if (hasExpiredDocuments) {
        return `Update expired documents (${expiredDocumentNames.join(", ")}) before you can accept trips`;
      }
      const date = tripDate?.trim() || today;
      if (!areDocsValidOnDate(driver, isUSA, date)) {
        const invalid = getRequiredDocExpiries(driver, isUSA)
          .filter((doc) => !isDocValidOnDate(doc.expiresOn, date))
          .map((doc) => doc.name);
        return `Documents expire before this trip date (${invalid.join(", ") || "check expiration dates"})`;
      }
      return null;
    },
    [
      driver,
      baseFieldsComplete,
      hasExpiredDocuments,
      expiredDocumentNames,
      isUSA,
      today,
    ],
  );

  return {
    isProfileComplete,
    missingFields,
    driver,
    hasDriver,
    hasExpiredDocuments,
    hasExpiringSoonDocuments,
    expiredDocumentNames,
    expiringSoonDocumentNames,
    canAcceptTripOnDate,
    getAcceptBlockReason,
  };
}
