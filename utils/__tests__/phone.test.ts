/**
 * `telUri` — the phone string as the OS dialer wants it.
 *
 * Contact phone numbers arrive from `Contacts.phone`, a free-text column an
 * office user typed into. So the input is whatever a human wrote: parentheses,
 * dashes, spaces, a country code or none, and sometimes nothing dialable at
 * all. `Linking.openURL` needs `tel:` followed by dialable characters only.
 *
 * Returning `null` rather than a `tel:` with no digits is what lets the sheet
 * render an inert "no number" row instead of a tappable one that opens a
 * dialer with an empty field.
 */

import { formatPhoneNumber, telUri } from "@/utils/phone";

describe("telUri", () => {
  it("strips the punctuation a human typed around a 10-digit number", () => {
    expect(telUri("(555) 123-4567")).toBe("tel:5551234567");
  });

  it("keeps a leading + so an international number still dials", () => {
    expect(telUri("+1 555-123-4567")).toBe("tel:+15551234567");
  });

  it("drops a + that is not leading, since only a prefix is meaningful", () => {
    expect(telUri("555-123+4567")).toBe("tel:5551234567");
  });

  it("returns null when there is no number to dial", () => {
    expect(telUri(null)).toBeNull();
    expect(telUri(undefined)).toBeNull();
    expect(telUri("")).toBeNull();
    expect(telUri("   ")).toBeNull();
    expect(telUri("n/a")).toBeNull();
    expect(telUri("+")).toBeNull();
  });
});

/**
 * `formatPhoneNumber` — the number as a human reads it.
 *
 * The behavior is lifted verbatim from the two identical copies that lived in
 * `ProfileScreen` and `EditDriverInfo`: 10 digits become `(XXX) XXX-XXXX`, and
 * anything else is returned untouched rather than mangled into a shape it does
 * not fit.
 *
 * The one deliberate change is the empty case. Both copies returned the string
 * "Not set" — a screen's placeholder wording baked into a formatter. Shared,
 * it returns `null` so each caller supplies its own placeholder; the contact
 * sheet's is not "Not set".
 */
describe("formatPhoneNumber", () => {
  it("formats 10 digits as (XXX) XXX-XXXX", () => {
    expect(formatPhoneNumber("5551234567")).toBe("(555) 123-4567");
  });

  it("re-formats a number that was already punctuated", () => {
    expect(formatPhoneNumber("555.123.4567")).toBe("(555) 123-4567");
  });

  it("returns anything that is not 10 digits untouched", () => {
    expect(formatPhoneNumber("+1 555-123-4567")).toBe("+1 555-123-4567");
    expect(formatPhoneNumber("555-1234")).toBe("555-1234");
    expect(formatPhoneNumber("ask for Dave")).toBe("ask for Dave");
  });

  it("returns null when there is no number, leaving the wording to the caller", () => {
    expect(formatPhoneNumber(null)).toBeNull();
    expect(formatPhoneNumber(undefined)).toBeNull();
    expect(formatPhoneNumber("")).toBeNull();
  });
});
