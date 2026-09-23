/**
 * Where a bleacher's GPS unit last reported, and how to show it on a map.
 *
 * Linxup has no public tracking page: its API needs a fleet-wide token, which
 * lives on the server and must stay there — shipped in the app bundle it would
 * be extractable from the `.ipa`, handing anyone the live position of every
 * trailer the company owns. The app therefore asks the web app's existing
 * endpoint, authenticated as the signed-in driver (same Clerk instance), and
 * that endpoint holds the token.
 *
 * Every failure is a value, never a throw. This is the only part of the event
 * roster that needs a network, and a driver holding a phone up in a field is
 * owed a sentence, not a spinner.
 */

export type DeviceLocation =
  | { kind: "ok"; lat: number; lng: number }
  /** The unit exists but has never reported a position. */
  | { kind: "no-position" }
  /** No such device — including a bleacher with no unit fitted at all. */
  | { kind: "not-found" }
  /** The server refused the driver's sign-in — a different fix to no signal. */
  | { kind: "unauthorized" }
  /** No signal, or the server could not answer. */
  | { kind: "unreachable" }
  /** This build has no server URL to ask. */
  | { kind: "not-configured" };

type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type DeviceLocationOptions = {
  /** The web app's origin, from EXPO_PUBLIC_WEB_URL. */
  baseUrl: string;
  /** The driver's Clerk session token. */
  token: string;
  fetchImpl: FetchLike;
};

export function googleMapsUrl(lat: number, lng: number): string {
  const query = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export async function fetchDeviceLocation(
  deviceId: string,
  options: DeviceLocationOptions,
): Promise<DeviceLocation> {
  const { baseUrl, token, fetchImpl } = options;

  if (!deviceId) return { kind: "not-found" };
  if (!baseUrl) return { kind: "not-configured" };

  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/api/linxup/devices/${encodeURIComponent(deviceId)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );

    if (response.status === 404) return { kind: "not-found" };
    if (response.status === 401 || response.status === 403) {
      return { kind: "unauthorized" };
    }
    if (!response.ok) return { kind: "unreachable" };

    const body = await response.json();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);

    // A unit that has not reported comes back with nulls, which `Number`
    // turns into 0 — a point in the Gulf of Guinea, and a very confident lie.
    if (
      body?.lat === null ||
      body?.lng === null ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      return { kind: "no-position" };
    }

    return { kind: "ok", lat, lng };
  } catch {
    return { kind: "unreachable" };
  }
}
