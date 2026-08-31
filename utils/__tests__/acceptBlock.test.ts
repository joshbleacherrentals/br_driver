import { getAcceptBlock } from "@/utils/acceptBlock";
import { formatExpiryDate } from "@/utils/documentExpiry";

const TODAY = "2026-08-26";

const validDriver = {
  license_photo_path: "d/license.jpg",
  insurance_photo_path: "d/insurance.jpg",
  medical_card_photo_path: "d/medical.jpg",
  license_expires_on: "2028-01-01",
  insurance_expires_on: "2028-01-01",
  medical_card_expires_on: "2028-01-01",
};

const base = {
  driver: validDriver,
  isUSA: false,
  baseFieldsComplete: true,
  missingFields: [] as string[],
  tripDate: "2026-09-03",
  today: TODAY,
};

describe("getAcceptBlock", () => {
  it("returns null when nothing blocks the trip", () => {
    expect(getAcceptBlock(base)).toBeNull();
  });

  it("blocks with a profile message when there is no driver row", () => {
    const block = getAcceptBlock({ ...base, driver: null });
    expect(block?.kind).toBe("no_profile");
    expect(block?.focus).toBeNull();
    expect(block?.shortReason).toBe("Profile incomplete");
  });

  it("names the missing profile fields", () => {
    const block = getAcceptBlock({
      ...base,
      baseFieldsComplete: false,
      missingFields: ["Phone Number", "Vehicle"],
    });
    expect(block?.kind).toBe("incomplete");
    expect(block?.message).toContain("Phone Number");
    expect(block?.message).toContain("Vehicle");
  });

  it("reports an expired document with its expiry date", () => {
    const block = getAcceptBlock({
      ...base,
      driver: { ...validDriver, license_expires_on: "2026-08-12" },
    });
    expect(block?.kind).toBe("expired");
    expect(block?.docs).toEqual(["license"]);
    expect(block?.focus).toBe("license");
    expect(block?.message).toContain("Driver's License");
    expect(block?.message).toContain(formatExpiryDate("2026-08-12"));
    expect(block?.shortReason).toBe("License expired");
  });

  it("reports several expired documents together", () => {
    const block = getAcceptBlock({
      ...base,
      driver: {
        ...validDriver,
        license_expires_on: "2026-08-12",
        insurance_expires_on: "2026-08-01",
      },
    });
    expect(block?.kind).toBe("expired");
    expect(block?.docs).toEqual(["license", "insurance"]);
    expect(block?.message).toContain("Driver's License");
    expect(block?.message).toContain("Insurance");
    expect(block?.shortReason).toBe("2 documents expired");
  });

  it("explains a document that is valid today but expires before the trip", () => {
    const block = getAcceptBlock({
      ...base,
      driver: { ...validDriver, license_expires_on: "2026-08-28" },
    });
    expect(block?.kind).toBe("expires_before_trip");
    expect(block?.docs).toEqual(["license"]);
    expect(block?.focus).toBe("license");
    expect(block?.message).toContain(formatExpiryDate("2026-08-28"));
    expect(block?.message).toContain(formatExpiryDate("2026-09-03"));
    expect(block?.shortReason).toBe("License expires before this trip");
  });

  it("ignores the medical card outside the USA", () => {
    const block = getAcceptBlock({
      ...base,
      driver: { ...validDriver, medical_card_expires_on: "2026-08-01" },
    });
    expect(block).toBeNull();
  });

  it("checks the medical card inside the USA", () => {
    const block = getAcceptBlock({
      ...base,
      isUSA: true,
      driver: { ...validDriver, medical_card_expires_on: "2026-08-01" },
    });
    expect(block?.kind).toBe("expired");
    expect(block?.docs).toEqual(["medical_card"]);
    expect(block?.shortReason).toBe("Medical card expired");
  });

  it("treats a document with no photo as incomplete, not expired", () => {
    const block = getAcceptBlock({
      ...base,
      baseFieldsComplete: false,
      missingFields: ["Driver's License"],
      driver: { ...validDriver, license_photo_path: null },
    });
    expect(block?.kind).toBe("incomplete");
  });

  it("prefers the expired message over the trip-date message", () => {
    const block = getAcceptBlock({
      ...base,
      driver: {
        ...validDriver,
        license_expires_on: "2026-08-12",
        insurance_expires_on: "2026-08-28",
      },
    });
    expect(block?.kind).toBe("expired");
    expect(block?.docs).toEqual(["license"]);
  });
});
