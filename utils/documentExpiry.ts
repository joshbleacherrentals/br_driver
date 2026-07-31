/** Soft-warn window: documents expiring within this many days (inclusive). */
export const DOC_EXPIRY_WARN_DAYS = 30;

export type DocExpiryStatus = "missing" | "expired" | "expiring_soon" | "ok";

/** Normalize DB date / timestamptz strings to YYYY-MM-DD. */
export function toISODateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

/** Local calendar date as YYYY-MM-DD (avoids UTC day-shift from toISOString). */
export function todayISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from `from` to `to` (YYYY-MM-DD). Negative if `to` is before `from`. */
export function calendarDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return NaN;
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function getDocExpiryStatus(
  expiresOn: string | null | undefined,
  asOf: string = todayISODate(),
): DocExpiryStatus {
  const date = toISODateOnly(expiresOn);
  if (!date) return "missing";
  if (date < asOf) return "expired";
  const days = calendarDaysBetween(asOf, date);
  if (Number.isNaN(days)) return "missing";
  if (days <= DOC_EXPIRY_WARN_DAYS) return "expiring_soon";
  return "ok";
}

/** Document is valid on `tripDate` if it expires on or after that day (inclusive). */
export function isDocValidOnDate(
  expiresOn: string | null | undefined,
  tripDate: string,
): boolean {
  const expiry = toISODateOnly(expiresOn);
  const trip = toISODateOnly(tripDate);
  if (!expiry || !trip) return false;
  return expiry >= trip;
}

export function formatExpiryDate(expiresOn: string): string {
  const date = toISODateOnly(expiresOn);
  if (!date) return expiresOn;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function expiryStatusLabel(
  status: DocExpiryStatus,
  expiresOn: string | null | undefined,
): string | null {
  if (status === "missing") return "Expiration date required";
  const date = toISODateOnly(expiresOn);
  if (!date) return null;
  if (status === "expired") return `Expired ${formatExpiryDate(date)}`;
  if (status === "expiring_soon") return `Expires ${formatExpiryDate(date)}`;
  return `Expires ${formatExpiryDate(date)}`;
}

export type DriverDocExpiryFields = {
  license_photo_path: string | null;
  insurance_photo_path: string | null;
  medical_card_photo_path: string | null;
  license_expires_on: string | null;
  insurance_expires_on: string | null;
  medical_card_expires_on: string | null;
};

export type RequiredDocExpiry = {
  name: string;
  photoPath: string | null;
  expiresOn: string | null;
};

export function getRequiredDocExpiries(
  driver: DriverDocExpiryFields,
  isUSA: boolean,
): RequiredDocExpiry[] {
  const docs: RequiredDocExpiry[] = [
    {
      name: "Driver's License",
      photoPath: driver.license_photo_path,
      expiresOn: driver.license_expires_on,
    },
    {
      name: "Insurance",
      photoPath: driver.insurance_photo_path,
      expiresOn: driver.insurance_expires_on,
    },
  ];
  if (isUSA) {
    docs.push({
      name: "Medical Card",
      photoPath: driver.medical_card_photo_path,
      expiresOn: driver.medical_card_expires_on,
    });
  }
  return docs;
}

export function getExpiredDocNames(
  driver: DriverDocExpiryFields,
  isUSA: boolean,
  asOf: string = todayISODate(),
): string[] {
  return getRequiredDocExpiries(driver, isUSA)
    .filter((doc) => getDocExpiryStatus(doc.expiresOn, asOf) === "expired")
    .map((doc) => doc.name);
}

export function getExpiringSoonDocNames(
  driver: DriverDocExpiryFields,
  isUSA: boolean,
  asOf: string = todayISODate(),
): string[] {
  return getRequiredDocExpiries(driver, isUSA)
    .filter(
      (doc) => getDocExpiryStatus(doc.expiresOn, asOf) === "expiring_soon",
    )
    .map((doc) => doc.name);
}

/** True if every required doc has an expiry date and is still valid on `tripDate`. */
export function areDocsValidOnDate(
  driver: DriverDocExpiryFields,
  isUSA: boolean,
  tripDate: string,
): boolean {
  return getRequiredDocExpiries(driver, isUSA).every((doc) => {
    if (!doc.photoPath || doc.photoPath.trim() === "") return false;
    return isDocValidOnDate(doc.expiresOn, tripDate);
  });
}
