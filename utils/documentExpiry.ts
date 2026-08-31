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

/**
 * Would this document stop the driver accepting a trip on `tripDate`?
 *
 * Independent of the 30-day warning window: a licence expiring in five weeks
 * is "ok" today and still blocks a trip six weeks out.
 */
export function blocksTripDate(
  expiresOn: string | null | undefined,
  tripDate: string | null | undefined,
): boolean {
  const trip = toISODateOnly(tripDate);
  if (!trip) return false;
  return !isDocValidOnDate(expiresOn, trip);
}

/** Why this document blocks that trip, with both dates spelled out. */
export function tripBlockLabel(
  expiresOn: string | null | undefined,
  tripDate: string,
): string {
  const date = toISODateOnly(expiresOn);
  if (!date) return "Expiration date required to accept this trip";
  return `Expires ${formatExpiryDate(date)} — before this trip on ${formatExpiryDate(tripDate)}`;
}

/** How loudly the UI should shout about an expiry status. */
export type ExpiryTone = "danger" | "warning" | "neutral";

export type ExpiryBadge = {
  status: DocExpiryStatus;
  tone: ExpiryTone;
  label: string;
};

/**
 * Status + colour tone + driver-facing label for one document's expiry.
 *
 * The label leads with the number the driver actually needs ("Expires in
 * 6 days") rather than a bare date they have to subtract from today.
 */
export function expiryBadge(
  expiresOn: string | null | undefined,
  asOf: string = todayISODate(),
): ExpiryBadge {
  const status = getDocExpiryStatus(expiresOn, asOf);
  const date = toISODateOnly(expiresOn);

  if (status === "missing" || !date) {
    return { status: "missing", tone: "danger", label: "Expiration date required" };
  }
  if (status === "expired") {
    return {
      status,
      tone: "danger",
      label: `Expired ${formatExpiryDate(date)}`,
    };
  }
  if (status === "expiring_soon") {
    const days = calendarDaysBetween(asOf, date);
    const lead =
      days <= 0
        ? "Expires today"
        : days === 1
          ? "Expires tomorrow"
          : `Expires in ${days} days`;
    return { status, tone: "warning", label: `${lead} · ${formatExpiryDate(date)}` };
  }
  return { status, tone: "neutral", label: `Expires ${formatExpiryDate(date)}` };
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

/** Stable key for one required document — also the `?focus=` deep-link value. */
export type DocSlug = "license" | "insurance" | "medical_card";

export type RequiredDocExpiry = {
  slug: DocSlug;
  name: string;
  /** Compact name for tight spots (a disabled button's reason line). */
  shortName: string;
  photoPath: string | null;
  expiresOn: string | null;
};

export function getRequiredDocExpiries(
  driver: DriverDocExpiryFields,
  isUSA: boolean,
): RequiredDocExpiry[] {
  const docs: RequiredDocExpiry[] = [
    {
      slug: "license",
      name: "Driver's License",
      shortName: "License",
      photoPath: driver.license_photo_path,
      expiresOn: driver.license_expires_on,
    },
    {
      slug: "insurance",
      name: "Insurance",
      shortName: "Insurance",
      photoPath: driver.insurance_photo_path,
      expiresOn: driver.insurance_expires_on,
    },
  ];
  if (isUSA) {
    docs.push({
      slug: "medical_card",
      name: "Medical Card",
      shortName: "Medical card",
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
