/**
 * `contactDisplayName` — the contact's name as one line.
 *
 * In Postgres `Contacts.first_name` is NOT NULL while `last_name` is nullable,
 * so a one-name contact is a normal record and not a data error. Either part
 * can also be whitespace an office user left behind, which must not turn into
 * a stray space in the sheet's heading.
 *
 * `null` for a nameless contact keeps the "do we have a name at all?" decision
 * with the caller instead of returning an empty string that renders as a
 * silently blank heading.
 */

import { contactDisplayName } from "@/utils/contact";

describe("contactDisplayName", () => {
  it("joins first and last name", () => {
    expect(
      contactDisplayName({ first_name: "Dave", last_name: "Brubeck" }),
    ).toBe("Dave Brubeck");
  });

  it("returns just the first name when there is no last name", () => {
    expect(contactDisplayName({ first_name: "Dave", last_name: null })).toBe(
      "Dave",
    );
  });

  it("does not leave a trailing space when a name part is only whitespace", () => {
    expect(contactDisplayName({ first_name: "Dave", last_name: "   " })).toBe(
      "Dave",
    );
    expect(contactDisplayName({ first_name: "  ", last_name: "Brubeck" })).toBe(
      "Brubeck",
    );
  });

  it("trims the parts it keeps", () => {
    expect(
      contactDisplayName({ first_name: " Dave ", last_name: " Brubeck " }),
    ).toBe("Dave Brubeck");
  });

  it("returns null when there is no name and when there is no contact", () => {
    expect(contactDisplayName({ first_name: "", last_name: null })).toBeNull();
    expect(contactDisplayName(null)).toBeNull();
    expect(contactDisplayName(undefined)).toBeNull();
  });
});
