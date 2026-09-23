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

/**
 * What the web endpoint knows about the unit besides its position. Every field
 * is optional and absent (`undefined`, never `null`) when the endpoint sent
 * nothing usable.
 */
export type DeviceDetails = {
  deviceId?: string;
  /** The unit's label in Linxup, e.g. "Trailer 12". */
  name?: string;
  vin?: string;
  /** Linxup's own word: "Moving", "Stopped", "Idle", … */
  status?: string;
  /** Unit unverified — the web labels it km/h, Linxup may send mph. */
  speed?: number;
  imei?: string;
  uuid?: string;
  /** When the unit last reported, epoch milliseconds. */
  updatedAtMs?: number;
};

export type DeviceLocation =
  | ({ kind: "ok"; lat: number; lng: number } & DeviceDetails)
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

function text(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** The web sends epoch ms as a string ("1790000000000"); anything else is no time. */
function epochMs(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  return typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : undefined;
}

/** Only the fields that carry a value, so absent ones stay truly absent. */
function readDetails(body: any): DeviceDetails {
  const details: DeviceDetails = {
    deviceId: text(body?.deviceId),
    name: text(body?.name),
    vin: text(body?.vin),
    status: text(body?.status),
    speed: finiteNumber(body?.speed),
    imei: text(body?.imei),
    uuid: text(body?.uuid),
    updatedAtMs: epochMs(body?.updatedAt),
  };

  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as DeviceDetails;
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
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
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

    return { kind: "ok", lat, lng, ...readDetails(body) };
  } catch {
    return { kind: "unreachable" };
  }
}
