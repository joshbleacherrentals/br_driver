/**
 * Deciding what to save when a driver edits their address.
 *
 * Three cases, and the difference between them is what stops a geocode from
 * being thrown away:
 *
 *   a picked place   every column, including country and lat/lng
 *   typed text only  `street` alone — there is nothing else to trust, and the
 *                    city / country / geocode already stored are still better
 *                    than the nulls a free-text entry would overwrite them with
 *   neither          nothing at all, so editing a phone number leaves the
 *                    address untouched
 */

import type { AddressData } from "@/features/profile/components/AddressAutoComplete";

/** `Addresses` columns, as Kysely wants them — null for "known to be absent". */
export type AddressWriteFields = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/**
 * Free text: the street line is all we know, so it is all we write. The other
 * columns are declared `never` rather than left off, so this stays one union a
 * caller can read `.country` or `.latitude` off — and so writing one here is a
 * type error, which is the whole point of the branch.
 */
export type StreetOnlyWriteFields = { street: string } & {
  [K in Exclude<keyof AddressWriteFields, "street">]?: never;
};

export function addressFieldsFor(
  picked: AddressData | null,
  typedText: string,
): AddressWriteFields | StreetOnlyWriteFields | null {
  if (picked) {
    return {
      street: picked.address || null,
      city: picked.city || null,
      state_province: picked.state || null,
      zip_postal: picked.postalCode || null,
      country: picked.country || null,
      // `?? null`, not `|| null` — a coordinate of 0 is a real place.
      latitude: picked.lat ?? null,
      longitude: picked.lng ?? null,
      place_id: picked.placeId || null,
    };
  }

  const street = typedText.trim();
  return street ? { street } : null;
}
