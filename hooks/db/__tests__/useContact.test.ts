/**
 * `buildContactQuery` — the local read behind the trip's contact sheet.
 *
 * Tested apart from `useContact` because the hook is wiring and the query is
 * the behavior: this is the same split `useInspection.test.ts` uses, and it
 * lets the SQL run against a real SQLite rather than a mocked query builder.
 *
 * No driver scoping here, deliberately. `Contacts` reaches a device only
 * through this driver's own `WorkTrackers` — the mobile sync stream joins both
 * `pickup_poc_contact_uuid` and `dropoff_poc_contact_uuid` back to
 * `WorkTrackers.driver_uuid` — so a device never holds a stranger's contact to
 * begin with, the same argument already made for `WorkTrackerLineItems`. What
 * the query owns is the two filters sync cannot express: the row must exist,
 * and it must not be soft-deleted.
 */

import { buildContactQuery } from "@/hooks/db/useContact";

import {
  mockDb,
  resetTestDb,
  seedContact,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

async function runQuery(contactId: string) {
  const { rows } = await mockDb.executeQuery(
    buildContactQuery(contactId).compile(),
  );
  return rows as { id: string; first_name: string | null; phone: string | null }[];
}

beforeEach(async () => {
  await resetTestDb();
});

describe("buildContactQuery", () => {
  it("returns the contact's name and phone", async () => {
    await seedContact("contact-1", {
      first_name: "Dave",
      last_name: "Brubeck",
      phone: "5551234567",
    });

    const rows = await runQuery("contact-1");

    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe("Dave");
    expect(rows[0].phone).toBe("5551234567");
  });

  it("returns nothing for a soft-deleted contact", async () => {
    await seedContact("contact-gone", { deleted: 1 });

    expect(await runQuery("contact-gone")).toHaveLength(0);
  });

  it("returns nothing for a contact that has not synced yet", async () => {
    await seedContact("contact-1");

    expect(await runQuery("contact-not-here")).toHaveLength(0);
  });

  it("does not return a different contact's row", async () => {
    await seedContact("contact-1", { first_name: "Dave" });
    await seedContact("contact-2", { first_name: "Ella" });

    const rows = await runQuery("contact-2");

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("contact-2");
  });
});
