import {
  DocSlug,
  DriverDocExpiryFields,
  formatExpiryDate,
  getDocExpiryStatus,
  getRequiredDocExpiries,
  isDocValidOnDate,
  todayISODate,
} from "@/utils/documentExpiry";

export type AcceptBlockKind =
  | "no_profile"
  | "incomplete"
  | "expired"
  | "expires_before_trip";

export type AcceptBlock = {
  kind: AcceptBlockKind;
  /** Alert title. */
  title: string;
  /** Alert body — plain sentences with the concrete dates spelled out. */
  message: string;
  /** One short line for the disabled Accept button. */
  shortReason: string;
  /** Documents the driver has to fix, in required order. */
  docs: DocSlug[];
  /** Which section the Edit Documents screen should open on. */
  focus: DocSlug | null;
};

/**
 * Locale date formats can end in a period ("27 вер. 2026 р."), which then
 * meets the sentence's own — collapse the pair.
 */
function tidy(sentence: string): string {
  return sentence.replace(/\.\.(\s|$)/g, ".$1");
}

/** "A", "A and B", "A, B and C" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type AcceptBlockInput = {
  driver: DriverDocExpiryFields | null;
  isUSA: boolean;
  /** Every required profile field is filled in (photos and expiry dates included). */
  baseFieldsComplete: boolean;
  missingFields: string[];
  /** Date of the trip being accepted (YYYY-MM-DD). */
  tripDate: string;
  today?: string;
};

/**
 * Why this driver cannot accept this trip — or `null` when they can.
 *
 * Ordered by what the driver has to do first: no profile, then missing
 * fields, then documents that are already expired, and last the subtle case
 * of a document that is valid today but runs out before the trip date.
 */
export function getAcceptBlock({
  driver,
  isUSA,
  baseFieldsComplete,
  missingFields,
  tripDate,
  today = todayISODate(),
}: AcceptBlockInput): AcceptBlock | null {
  if (!driver) {
    return {
      kind: "no_profile",
      title: "Finish your profile",
      message:
        "Complete your profile before you can accept any trips.",
      shortReason: "Profile incomplete",
      docs: [],
      focus: null,
    };
  }

  if (!baseFieldsComplete) {
    const list = joinNames(missingFields);
    return {
      kind: "incomplete",
      title: "Profile incomplete",
      message: list
        ? `Add your ${list} before you can accept trips.`
        : "Complete your profile before you can accept any trips.",
      shortReason: "Profile incomplete",
      docs: [],
      focus: null,
    };
  }

  const required = getRequiredDocExpiries(driver, isUSA);

  const expired = required.filter(
    (doc) => getDocExpiryStatus(doc.expiresOn, today) === "expired",
  );
  if (expired.length > 0) {
    const names = joinNames(expired.map((doc) => doc.name));
    const message =
      expired.length === 1
        ? `Your ${expired[0].name} expired ${formatExpiryDate(expired[0].expiresOn ?? "")}. Update it before you can accept trips.`
        : `Your ${names} have expired. Update them before you can accept trips.`;
    return {
      kind: "expired",
      title: "Documents expired",
      message: tidy(message),
      shortReason:
        expired.length === 1
          ? `${expired[0].shortName} expired`
          : `${expired.length} documents expired`,
      docs: expired.map((doc) => doc.slug),
      focus: expired[0].slug,
    };
  }

  const stale = required.filter(
    (doc) => !isDocValidOnDate(doc.expiresOn, tripDate),
  );
  if (stale.length > 0) {
    const trip = formatExpiryDate(tripDate);
    const names = joinNames(stale.map((doc) => doc.name));
    const message =
      stale.length === 1
        ? `Your ${stale[0].name} expires ${formatExpiryDate(stale[0].expiresOn ?? "")}. This trip is ${trip}. Update it to accept this trip.`
        : `Your ${names} expire before this trip on ${trip}. Update them to accept this trip.`;
    return {
      kind: "expires_before_trip",
      title: "Documents expire before this trip",
      message: tidy(message),
      shortReason:
        stale.length === 1
          ? `${stale[0].shortName} expires before this trip`
          : "Documents expire before this trip",
      docs: stale.map((doc) => doc.slug),
      focus: stale[0].slug,
    };
  }

  return null;
}
