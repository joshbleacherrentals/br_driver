/**
 * Phone-number helpers.
 *
 * `Contacts.phone` and `Drivers.phone_number` are free-text columns, so every
 * function here treats its input as something a human typed rather than as a
 * normalized number.
 */

/**
 * The `tel:` URI for a phone number, or `null` when nothing dialable is there.
 *
 * A leading `+` survives because it is the international prefix the dialer
 * needs; a `+` anywhere else is punctuation the typist left behind.
 */
export function telUri(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  return trimmed.startsWith("+") ? `tel:+${digits}` : `tel:${digits}`;
}

/**
 * A phone number as a human reads it: `(XXX) XXX-XXXX` for the 10-digit US
 * numbers this app almost always sees, and untouched for anything else — a
 * number that does not fit the shape is better shown as typed than reshaped
 * into a wrong one.
 *
 * `null` in, `null` out: the placeholder wording belongs to the screen.
 */
export function formatPhoneNumber(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length !== 10) return phone;

  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}
