import { addressRegion, isUSAddress } from "@/utils/addressCountry";

describe("addressRegion", () => {
  describe("the country column, once an address has one", () => {
    it("reads Google's ISO-2 codes", () => {
      expect(addressRegion({ country: "US" })).toBe("US");
      expect(addressRegion({ country: "CA" })).toBe("CAN");
    });

    it("accepts the longer spellings an office user may have typed", () => {
      expect(addressRegion({ country: "USA" })).toBe("US");
      expect(addressRegion({ country: "United States" })).toBe("US");
      expect(addressRegion({ country: "canada" })).toBe("CAN");
      expect(addressRegion({ country: "  CAN  " })).toBe("CAN");
    });

    it("wins over the street tail rather than being cross-checked with it", () => {
      // The column is authoritative: a stale "USA" left in the free text of a
      // re-saved Canadian address must not outvote it.
      expect(
        addressRegion({ street: "1 Main St, Springfield, USA", country: "CA" }),
      ).toBe("CAN");
    });

    it("is null for a country the app has no rules for, without falling back", () => {
      expect(
        addressRegion({ street: "1 Main St, Mexico City, USA", country: "MX" }),
      ).toBeNull();
    });
  });

  describe("pre-migration rows, which have no country at all", () => {
    // Neither migration backfills; every address saved before them keeps a
    // null country until a driver re-picks it. Until then the legacy tail
    // parse is all there is, and dropping it would quietly stop requiring a
    // US driver's medical card.
    it("falls back to the tail of the street text", () => {
      expect(addressRegion({ street: "1 Main St, Springfield, IL, USA" })).toBe(
        "US",
      );
      expect(addressRegion({ street: "1 King St, Toronto, ON, Canada" })).toBe(
        "CAN",
      );
    });

    it("treats an empty country the same as a missing one", () => {
      expect(addressRegion({ street: "1 Main St, USA", country: "" })).toBe(
        "US",
      );
      expect(addressRegion({ street: "1 Main St, USA", country: "   " })).toBe(
        "US",
      );
    });

    it("is null when the tail names no country it knows", () => {
      expect(
        addressRegion({ street: "1 Main St, Springfield, IL" }),
      ).toBeNull();
      expect(addressRegion({ street: "" })).toBeNull();
    });
  });

  it("is null when there is no address at all", () => {
    expect(addressRegion(null)).toBeNull();
    expect(addressRegion(undefined)).toBeNull();
    expect(addressRegion({})).toBeNull();
  });
});

describe("isUSAddress", () => {
  it("is true only for the US", () => {
    expect(isUSAddress({ country: "US" })).toBe(true);
    expect(isUSAddress({ street: "1 Main St, USA" })).toBe(true);
  });

  it("is false for Canada, for the unknown, and for nothing", () => {
    expect(isUSAddress({ country: "CA" })).toBe(false);
    expect(isUSAddress({ country: "MX" })).toBe(false);
    expect(isUSAddress({ street: "1 Main St, Springfield" })).toBe(false);
    expect(isUSAddress(null)).toBe(false);
  });
});
