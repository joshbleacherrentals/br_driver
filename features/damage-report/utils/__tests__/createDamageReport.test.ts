/**
 * The invariant the product decision rests on: a damage report is never created
 * without at least one photo on it.
 *
 * The old order was report row → photos, so any failure after the first write
 * left an evidence-free report behind — and a cancel mid-loop left one that the
 * driver had explicitly abandoned. The order is now photos-to-disk → rows, and
 * the rows go in one transaction, so "report exists" and "report has photos"
 * became the same fact rather than two hopeful ones.
 *
 * `prepareDamageReportPhotos` is mocked (its own suite covers it); what is under
 * test is what `createDamageReport` does — and refuses to do — with its verdict.
 */

import {
  commitDamageReport,
  createDamageReport,
} from "@/features/damage-report/utils/createDamageReport";
import { prepareDamageReportPhotos } from "@/features/damage-report/utils/prepareDamageReportPhotos";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";

jest.mock("@/features/damage-report/utils/prepareDamageReportPhotos", () => ({
  __esModule: true,
  prepareDamageReportPhotos: jest.fn(),
}));

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedTransaction: jest.fn(),
}));

// The real module boots PowerSync; only the Kysely query builder is needed to
// compile the inserts under test.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Kysely, DummyDriver, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } = require("kysely");
  return {
    __esModule: true,
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (database: unknown) =>
          new SqliteIntrospector(database as never),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
    powerSyncDb: {},
  };
});

jest.mock("@/library/photoUploadQueue", () => ({
  __esModule: true,
  getPhotoUploadService: () => ({ triggerFast: jest.fn() }),
}));

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "photo-row-id",
}));

const mockPrepare = prepareDamageReportPhotos as jest.MockedFunction<
  typeof prepareDamageReportPhotos
>;
const mockTransaction = executeTypedTransaction as jest.MockedFunction<
  typeof executeTypedTransaction
>;

const scope = { userUuid: "user-1", driverUuid: "driver-1" } as DriverScope;

const fields = {
  bleacherUuid: "bleacher-1",
  inspectionUuid: null,
  seatDamage: 1 as const,
  haulDamage: null,
  note: "cracked plank",
  scope,
};

/** Records the statements a commit would run, without a database. */
function captureStatements(): { sql: string[] } {
  const sql: string[] = [];
  mockTransaction.mockImplementation(async (callback) =>
    callback({
      run: async (compiled) => {
        sql.push(compiled.sql);
        return undefined as never;
      },
    }),
  );
  return { sql };
}

beforeEach(() => {
  mockTransaction.mockReset();
});

describe("createDamageReport", () => {
  it("writes nothing at all when every photo failed to save", async () => {
    const failures = [{ reason: "file_missing" as const, uri: "file:///gone.jpg" }];
    mockPrepare.mockResolvedValue({
      ok: false,
      reason: "all_photos_failed",
      failures,
    });
    captureStatements();

    const result = await createDamageReport({ ...fields, photos: [] });

    expect(result).toEqual({
      ok: false,
      reason: "all_photos_failed",
      failures,
    });
    // The load-bearing assertion: no report row, no photo rows, nothing.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("writes nothing when the driver cancels", async () => {
    mockPrepare.mockResolvedValue({ ok: false, reason: "aborted" });
    captureStatements();

    const result = await createDamageReport({ ...fields, photos: [] });

    expect(result).toEqual({ ok: false, reason: "aborted" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("commits the report and every prepared photo in one transaction", async () => {
    const { sql } = captureStatements();

    const result = await commitDamageReport(
      {
        damageId: "damage-1",
        photos: [
          { photoPath: "damage-1/photo_0.jpg", thumbnail: "AAA" },
          { photoPath: "damage-1/photo_1.jpg", thumbnail: null },
        ],
        failures: [],
      },
      fields,
    );

    expect(result).toMatchObject({
      ok: true,
      damageId: "damage-1",
      savedPhotoCount: 2,
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain('insert into "DamageReports"');
    expect(sql[1]).toContain('insert into "DamageReportPhotos"');
    expect(sql[2]).toContain('insert into "DamageReportPhotos"');
  });

  it("still commits a partial save, and hands the failures back to be reported", async () => {
    // §2 — a photo already on disk must still reach the bucket. A partial
    // failure is told to the driver, never rolled back.
    const failures = [{ reason: "file_missing" as const, uri: "file:///gone.jpg" }];
    captureStatements();

    const result = await commitDamageReport(
      {
        damageId: "damage-2",
        photos: [{ photoPath: "damage-2/photo_0.jpg", thumbnail: null }],
        failures,
      },
      fields,
    );

    expect(result).toEqual({
      ok: true,
      damageId: "damage-2",
      savedPhotoCount: 1,
      failures,
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
