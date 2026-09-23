/**
 * The in-app "Live Location" screen shows more than a point: which unit it is,
 * whether it is moving, and how fresh the reading is — the same card the
 * office sees on the web dashboard.
 *
 * The web endpoint sends `updatedAt` as epoch milliseconds written as a
 * string (the web does `new Date(parseInt(updatedAt))`). Anything missing
 * comes back as `undefined`, never `null`, so a bare `{ lat, lng }` response
 * still equals `{ kind: "ok", lat, lng }`.
 */

import { fetchDeviceLocation } from "@/utils/eventRoster/linxupLocation";

const options = { baseUrl: "https://app.example.com", token: "clerk-token" };

const respond = (body: unknown) =>
  jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe("fetchDeviceLocation — device details", () => {
  it("carries everything the web card shows", async () => {
    const fetchImpl = respond({
      deviceId: "861234567890123",
      name: "Trailer 12",
      imei: "861234567890123",
      uuid: "8f2c9f3a-1111-2222-3333-444455556666",
      vin: "1FTFW1ET5DFC10312",
      status: "Moving",
      lat: 43.6532,
      lng: -79.3832,
      speed: 88,
      updatedAt: "1790000000000",
    });

    await expect(
      fetchDeviceLocation("861234567890123", { ...options, fetchImpl }),
    ).resolves.toEqual({
      kind: "ok",
      lat: 43.6532,
      lng: -79.3832,
      deviceId: "861234567890123",
      name: "Trailer 12",
      imei: "861234567890123",
      uuid: "8f2c9f3a-1111-2222-3333-444455556666",
      vin: "1FTFW1ET5DFC10312",
      status: "Moving",
      speed: 88,
      updatedAtMs: 1790000000000,
    });
  });

  it("reads updatedAt as epoch milliseconds sent as a string", async () => {
    const fetchImpl = respond({ lat: 1, lng: 2, updatedAt: "1790000000000" });

    const result = await fetchDeviceLocation("d", { ...options, fetchImpl });

    expect(result.kind === "ok" && result.updatedAtMs).toBe(1790000000000);
  });

  it.each([null, "", "yesterday", "12abc"])(
    "leaves updatedAt out when it is %p rather than inventing a time",
    async (updatedAt) => {
      const fetchImpl = respond({ lat: 1, lng: 2, updatedAt });

      const result = await fetchDeviceLocation("d", { ...options, fetchImpl });

      expect(result).toEqual({ kind: "ok", lat: 1, lng: 2 });
      expect(
        result.kind === "ok" && "updatedAtMs" in result
          ? result.updatedAtMs
          : undefined,
      ).toBeUndefined();
    },
  );

  it("turns the endpoint's nulls into absent fields, not nulls", async () => {
    const fetchImpl = respond({
      lat: 1,
      lng: 2,
      name: null,
      imei: null,
      uuid: null,
      vin: null,
      status: null,
      speed: null,
      updatedAt: null,
    });

    const result = await fetchDeviceLocation("d", { ...options, fetchImpl });

    expect(result).toEqual({ kind: "ok", lat: 1, lng: 2 });
    expect(Object.values(result)).not.toContain(null);
  });

  it("keeps a reported speed of zero", async () => {
    const fetchImpl = respond({ lat: 1, lng: 2, speed: 0 });

    const result = await fetchDeviceLocation("d", { ...options, fetchImpl });

    expect(result.kind === "ok" && result.speed).toBe(0);
  });
});
