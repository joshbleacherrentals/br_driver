/**
 * Flattening Google's `address_components` into the columns we save.
 *
 * The driver app used to keep the whole dropdown suggestion ("Business Name,
 * Street, City, State, Country") in `Addresses.street` and take `city` from
 * whatever `locality` component turned up, with no fallback. Both are wrong
 * now that an address is stored — and rendered — part by part: the full
 * suggestion in `street` makes formatAddress() print the city and state
 * twice, and a rural or business-only result with no `locality` saved its
 * county as the city.
 *
 * This mirrors `parseGoogleAddressComponents` in the office app
 * (bleacher_rentals `src/components/parseGoogleAddressComponents.ts`) so an
 * address saved by a driver and one saved by an account manager are shaped
 * identically. Keep the two in step.
 */

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type ParsedAddress = {
  /** The street line only — `street_number route`. */
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** ISO-2 country code (e.g. "US", "CA") — `short_name` on the country component. */
  country?: string;
};

export function parseGoogleAddressComponents(
  components: GoogleAddressComponent[],
  fallbackAddress: string,
): ParsedAddress {
  const componentOfType = (...types: string[]): string | undefined =>
    components.find((comp) => types.some((t) => comp.types.includes(t)))
      ?.long_name;

  const streetNumber = componentOfType("street_number");
  const route = componentOfType("route");
  // Not every result has a street number + route (a named property, a park,
  // etc.) — fall back to the full suggestion text rather than an empty street.
  const address =
    [streetNumber, route].filter(Boolean).join(" ") || fallbackAddress;

  const state = componentOfType("administrative_area_level_1");
  // `locality` is the town/city for most results, but rural or business-only
  // places sometimes only carry a coarser component — fall back through the
  // next-most-specific ones rather than leaving city blank (or saving a
  // county in its place).
  const city = componentOfType(
    "locality",
    "sublocality",
    "postal_town",
    "administrative_area_level_3",
  );
  const postalCode = componentOfType("postal_code");

  // short_name, not long_name — "US"/"CA", an ISO-2 code, not "United States".
  const country = components.find((comp) =>
    comp.types.includes("country"),
  )?.short_name;

  return { address, city, state, postalCode, country };
}
