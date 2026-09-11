import { formatAddress, mapsQuery } from "@/utils/formatAddress";

const stPete = {
  street: "7901 4th St N 25767",
  city: "St. Petersburg",
  state_province: "FL",
  zip_postal: "33702",
  country: "United States",
  latitude: 27.8619,
  longitude: -82.6396,
};

describe("formatAddress", () => {
  it("writes the address the way it is put on an envelope", () => {
    expect(formatAddress(stPete)).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702",
    );
  });

  it("names the country only when the stop is not domestic", () => {
    expect(formatAddress({ ...stPete, country: "Canada" })).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702, Canada",
    );
  });

  it("leaves out the parts an address row does not have", () => {
    expect(
      formatAddress({
        ...stPete,
        zip_postal: null,
        country: null,
      }),
    ).toBe("7901 4th St N 25767, St. Petersburg, FL");
    expect(
      formatAddress({
        ...stPete,
        city: "",
        state_province: "",
        zip_postal: "",
      }),
    ).toBe("7901 4th St N 25767");
  });

  it("has nothing to show without an address", () => {
    expect(formatAddress(null)).toBeNull();
    expect(
      formatAddress({
        street: null,
        city: null,
        state_province: null,
        zip_postal: null,
      }),
    ).toBeNull();
  });
});

describe("mapsQuery", () => {
  it("sends the driver to the geocoded point when the office has one", () => {
    // A geocode beats a string a maps app has to guess at — the same street
    // name exists in every county in Florida.
    expect(mapsQuery(stPete)).toBe("27.8619,-82.6396");
  });

  it("falls back to the written address when there is no geocode", () => {
    expect(mapsQuery({ ...stPete, latitude: null, longitude: null })).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702",
    );
  });

  it("has nowhere to send the driver without an address", () => {
    expect(mapsQuery(null)).toBeNull();
  });
});
