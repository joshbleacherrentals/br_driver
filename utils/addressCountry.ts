/**
 * Which country an address is in.
 *
 * `Addresses.country` holds the ISO-2 code Google's Places API returns, and is
 * the answer whenever a row has one. Before that column existed the app
 * guessed, in four separate places, by splitting `street` on commas and
 * string-matching the tail for "USA" / "Canada" — brittle, and wrong as soon
 * as a suggestion's formatting varied.
 *
 * Neither address migration backfills, so every row saved before them keeps a
 * null country until someone re-picks the address through the autocomplete.
 * That is why the old tail parse survives here as a fallback rather than being
 * deleted: it is the only signal those rows have, and this answer decides
 * whether a driver is required to hold a medical card. Dropping it would
 * silently stop asking US drivers for one.
 *
 * The column is authoritative when present — a row re-saved as Canadian can
 * still carry "USA" in the middle of its old free text, and the column has to
 * win.
 */

/** The regions the app has rules for — matches `BlueBook.region` values. */
export type DriverRegion = "US" | "CAN";

export type CountryBearingAddress = {
  street?: string | null;
  country?: string | null;
};

const COUNTRY_CODES: Readonly<Record<string, DriverRegion>> = {
  us: "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  ca: "CAN",
  can: "CAN",
  canada: "CAN",
};

/** The tail of the legacy free-text `street`, as it used to be written. */
function regionFromStreetTail(
  street: string | null | undefined,
): DriverRegion | null {
  const tail = street?.split(",").pop()?.trim().toLowerCase();
  if (!tail) return null;
  return COUNTRY_CODES[tail] ?? null;
}

/**
 * The address's region, or null when it names no country this app knows —
 * including an address that is simply in neither country.
 */
export function addressRegion(
  address: CountryBearingAddress | null | undefined,
): DriverRegion | null {
  if (!address) return null;

  const country = address.country?.trim();
  if (country) return COUNTRY_CODES[country.toLowerCase()] ?? null;

  return regionFromStreetTail(address.street);
}

/** Whether US rules apply — the medical card requirement, in particular. */
export function isUSAddress(
  address: CountryBearingAddress | null | undefined,
): boolean {
  return addressRegion(address) === "US";
}
