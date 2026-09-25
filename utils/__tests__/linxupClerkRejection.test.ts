/**
 * When the web app's Clerk middleware refuses the driver's token it does not
 * answer 401: `auth.protect()` rewrites the request to the not-found page —
 * a 404 with no token, a 200 HTML page with a bad or expired one — and marks
 * it with `x-clerk-auth-status: signed-out`.
 *
 * Read naively, that tells a driver whose session lapsed that "no GPS tracker
 * is registered for this bleacher", or to check their connection — both
 * wrong, and both send them chasing the wrong fix. The Clerk header is the
 * signal. HTML without it is something else between the phone and the server
 * (a hotel or stadium Wi-Fi sign-in page), which really is a connection
 * problem.
 */

import { fetchDeviceLocation } from "@/utils/eventRoster/linxupLocation";

const options = { baseUrl: "https://app.example.com", token: "clerk-token" };

type Reply = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  html?: boolean;
};

function reply({ status, headers = {}, body, html = false }: Reply) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (html) throw new SyntaxError("Unexpected token '<'");
      return body;
    },
  });
}

const SIGNED_OUT = {
  "x-clerk-auth-status": "signed-out",
  "content-type": "text/html; charset=utf-8",
};

describe("fetchDeviceLocation — Clerk refusing the session", () => {
  it("reports a refused sign-in when Clerk rewrites to a 404", async () => {
    const fetchImpl = reply({ status: 404, headers: SIGNED_OUT, html: true });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unauthorized" });
  });

  it("reports a refused sign-in when Clerk answers 200 with its not-found page", async () => {
    const fetchImpl = reply({ status: 200, headers: SIGNED_OUT, html: true });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unauthorized" });
  });

  it("reads the Clerk header regardless of its case", async () => {
    const fetchImpl = reply({
      status: 404,
      headers: { "X-Clerk-Auth-Status": "signed-out" },
      html: true,
    });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unauthorized" });
  });

  it("treats an HTML page without the Clerk header as a connection problem", async () => {
    // A captive portal: the phone has "Wi-Fi" but not the internet yet.
    const fetchImpl = reply({
      status: 200,
      headers: { "content-type": "text/html" },
      html: true,
    });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "unreachable" });
  });

  it("still reports a device the fleet does not know when the driver is signed in", async () => {
    const fetchImpl = reply({
      status: 404,
      headers: {
        "x-clerk-auth-status": "signed-in",
        "content-type": "application/json",
      },
      body: { error: "Device not found" },
    });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "not-found" });
  });

  it("still returns the position for a signed-in driver", async () => {
    const fetchImpl = reply({
      status: 200,
      headers: {
        "x-clerk-auth-status": "signed-in",
        "content-type": "application/json",
      },
      body: { lat: 43.6532, lng: -79.3832 },
    });

    await expect(
      fetchDeviceLocation("device-1", { ...options, fetchImpl }),
    ).resolves.toEqual({ kind: "ok", lat: 43.6532, lng: -79.3832 });
  });
});
