/**
 * Contact helpers — presentation of a `Contacts` row.
 */

/** Just the name parts, so callers can pass any row shape that carries them. */
export type ContactName = {
  first_name: string | null;
  last_name: string | null;
};

/**
 * The contact's name as one line, or `null` when the row carries no name.
 *
 * `last_name` is nullable in Postgres, so a one-name contact is ordinary data
 * rather than a defect; each part is trimmed and empty parts are dropped so a
 * missing half never shows up as a stray space.
 */
export function contactDisplayName(
  contact: ContactName | null | undefined,
): string | null {
  if (!contact) return null;

  const parts = [contact.first_name, contact.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : null;
}
