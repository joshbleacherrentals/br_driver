/**
 * "Track" on a bleacher that has a GPS unit.
 *
 * Linxup publishes no shareable tracking link — the coordinates come from an
 * API behind a secret token, which stays on the server (the web app's
 * /api/linxup/devices/{id}, same Clerk instance). The app asks it where the
 * trailer is and hands the point to a maps app.
 *
 * This is the one part of the roster that needs signal, so every way it can
 * fail has to come back as something the driver can read: a phone in a field
 * with no bars must not produce a spinner that never ends, and a bleacher
 * whose unit has not reported must not look like a broken app.
 */

import {
  fetchDeviceLocation,
  googleMapsUrl,
} from "@/utils/eventRoster/linxupLocation";

const ok = (body: unknown) =>
  jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe("googleMapsUrl", () => {
  it("points a maps app at the coordinates", () => {
    expect(googleMapsUrl(43.6532, -79.3832)).toBe(
      "https://www.google.com/maps/search/?api=1&query=43.6532%2C-79.3832",
    );
  });
});

describe("fetchDeviceLocation", () => {
  const options = { baseUrl: "https://app.example.com", token: "clerk-token" };

  it("returns where the device last reported", async () => {
    const fetchImpl = ok({ lat: 43.6532, lng: -79.3832 });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "ok", lat: 43.6532, lng: -79.3832 });
  });

  it("asks the server for that device, as the signed-in driver", async () => {
    const fetchImpl = ok({ lat: 1, lng: 2 });

    await fetchDeviceLocation("device 1/2", { ...options, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://app.example.com/api/linxup/devices/device%201%2F2",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer clerk-token" }),
      }),
    );
  });

  it("reports a device that has never reported a position", async () => {
    const fetchImpl = ok({ lat: null, lng: null });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "no-position" });
  });

  it("reports a device the fleet does not know", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "not-found" });
  });

  it("reports a phone with no signal rather than throwing at the caller", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("Network request failed"));

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unreachable" });
  });

  it("reports a server that answered with an error", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unreachable" });
  });

  it.each([401, 403])(
    "separates a rejected sign-in (%i) from a dead connection",
    async (status) => {
      // These two failures have opposite fixes — sign in again vs find signal
      // — and reporting both as "check your connection" sends the driver (and
      // whoever they call) chasing the wrong one.
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });

      await expect(
        fetchDeviceLocation("device-1", { ...options, fetchImpl }),
      ).resolves.toEqual({ kind: "unauthorized" });
    },
  );

  it("has nowhere to ask when the app was built without a server URL", async () => {
    const fetchImpl = ok({ lat: 1, lng: 2 });

    await expect(
      fetchDeviceLocation("device-1", { ...options, baseUrl: "", fetchImpl }),
    ).resolves.toEqual({ kind: "not-configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call out for a bleacher with no GPS unit", async () => {
    const fetchImpl = ok({ lat: 1, lng: 2 });

    await expect(
      fetchDeviceLocation("", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
