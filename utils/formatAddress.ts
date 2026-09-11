/**
 * Writing an address out.
 *
 * An address stopped being `street` alone: it is `street`, `city`,
 * `state_province`, `zip_postal` and `country`, plus a `latitude` /
 * `longitude` geocode when the office picked the stop off a map. Every screen
 * that shows a stop — trip card, trip history, bill of lading — writes it the
 * same way through here.
 */

export type FormattableAddress = {
  street?: string | null;
  city?: string | null;
  state_province?: string | null;
  zip_postal?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Countries whose name adds nothing for a driver working in the US. */
const DOMESTIC_COUNTRIES: ReadonlySet<string> = new Set([
  "us",
  "usa",
  "united states",
  "united states of america",
]);

function clean(part: string | null | undefined): string | null {
  const trimmed = part?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The address on one line — `street, city, ST zip[, country]` — with every
 * part the row does not have left out rather than rendered as a gap between
 * commas. Null when there is nothing at all to show.
 */
export function formatAddress(
  address: FormattableAddress | null | undefined,
): string | null {
  if (!address) return null;

  const street = clean(address.street);
  const city = clean(address.city);
  const state = clean(address.state_province);
  const zip = clean(address.zip_postal);
  const country = clean(address.country);

  // State and zip belong together on the last line, unseparated — "FL 33702".
  const region = [state, zip].filter(Boolean).join(" ") || null;
  const isDomestic = !country || DOMESTIC_COUNTRIES.has(country.toLowerCase());

  const parts = [street, city, region, isDomestic ? null : country].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * What to hand a maps app: the geocode when the office picked the stop off a
 * map, the written address otherwise. Null when there is no stop to open.
 */
export function mapsQuery(
  address: FormattableAddress | null | undefined,
): string | null {
  if (!address) return null;

  const { latitude, longitude } = address;
  if (typeof latitude === "number" && typeof longitude === "number") {
    return `${latitude},${longitude}`;
  }

  return formatAddress(address);
}
