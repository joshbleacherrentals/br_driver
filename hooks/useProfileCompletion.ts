import { useAddress } from "@/hooks/db/useAddress";
import { useDriver } from "@/hooks/db/useDriver";
import { isUSAddress } from "@/utils/addressCountry";
import {
  AcceptBlock,
  getAcceptBlock as buildAcceptBlock,
} from "@/utils/acceptBlock";
import {
  areDocsValidOnDate,
  getDocExpiryStatus,
  getExpiredDocNames,
  getExpiringSoonDocNames,
  getRequiredDocExpiries,
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
  const isUSA = isUSAddress(address);
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

  /**
   * Why this trip cannot be accepted, phrased for the driver — see
   * `getAcceptBlock`. `null` means nothing is in the way.
   */
  const getAcceptBlock = useCallback(
    (tripDate: string | null | undefined): AcceptBlock | null =>
      buildAcceptBlock({
        driver,
        isUSA,
        baseFieldsComplete,
        missingFields,
        tripDate: tripDate?.trim() || today,
        today,
      }),
    [driver, isUSA, baseFieldsComplete, missingFields, today],
  );

  /** Section the Edit Documents screen should open on, when one stands out. */
  const problemDocSlug = useMemo(() => {
    if (!driver) return null;
    const docs = getRequiredDocExpiries(driver, isUSA);
    const expired = docs.find(
      (doc) => getDocExpiryStatus(doc.expiresOn, today) === "expired",
    );
    if (expired) return expired.slug;
    const soon = docs.find(
      (doc) => getDocExpiryStatus(doc.expiresOn, today) === "expiring_soon",
    );
    return soon?.slug ?? null;
  }, [driver, isUSA, today]);

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
    getAcceptBlock,
    problemDocSlug,
  };
}
