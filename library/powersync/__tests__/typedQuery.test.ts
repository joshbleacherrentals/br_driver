/**
 * Regression pin for the "disabled query" path of `useTypedQuery`.
 *
 * WHAT BROKE
 * A dozen hooks in `hooks/db/` (and `SystemProvider`'s §15 Clerk → `Users` →
 * `Drivers` lookups) guard their query with `useMemo(() => id ? …compile() :
 * null, [id])`, so `useTypedQuery` is legitimately called with `null` on the
 * renders before the id resolves. The wrapper used to answer that with
 * `sql = ""` and pass it to `useQuery` regardless — and `useQuery` has no
 * disabled mode. It always builds a `WatchedQuery`, whose `linkQuery` calls
 * `AbstractPowerSyncDatabase.resolveTables`, which runs `EXPLAIN ${sql}`. With
 * an empty string that is the literal `"EXPLAIN "`, which SQLite rejects with
 * `incomplete input`. The rejection came back as `.error` on a query nobody
 * asked for; it only ever surfaced in the one place that reads `.error`
 * (`§15 driver-context lookup failed …`) and was silent in the other ~12.
 *
 * WHAT THIS PINS
 * 1. The disabled SQL is not the empty string, and survives the exact
 *    `EXPLAIN ${sql}` that `resolveTables` performs — checked against real
 *    SQLite, not a stub, because the empty-string bug was invisible to every
 *    layer above the engine.
 * 2. Its plan contains no `OpenRead`, so `resolveTables` resolves *zero* tables
 *    and the placeholder never registers a table-change listener — a disabled
 *    query cannot spuriously re-fire on unrelated writes.
 * 3. The wrapper actually hands that SQL to `useQuery`, and reports
 *    `isDisabled` so callers can tell "nothing was asked yet" apart from "asked,
 *    matched nothing" (both are `data: []`).
 *
 * The SQLite here is `better-sqlite3` (a devDependency) rather than the
 * op-sqlite the app ships: the failure is plain SQL-grammar level — the same
 * `incomplete input` on `EXPLAIN ` — so any real engine reproduces it, and a
 * native RN module is not loadable under Jest.
 */

import Database from "better-sqlite3";
import { CompiledQuery } from "kysely";

import {
  DISABLED_QUERY_SQL,
  expect as expectType,
  useTypedQuery,
  type TypedQueryResult,
} from "@/library/powersync/typedQuery";

const mockUseQuery = jest.fn(() => ({
  data: [] as any[],
  isLoading: false,
  isFetching: false,
  error: undefined as Error | undefined,
}));

jest.mock("@powersync/react-native", () => ({
  usePowerSync: () => ({ __stubDatabase: true }),
  useQuery: (...args: any[]) => (mockUseQuery as any)(...args),
}));

/**
 * `useTypedQuery`'s only real hook is `useMemo` (the two PowerSync hooks are
 * mocked above), so a pass-through `useMemo` lets the hook be driven as a plain
 * function and keeps this test free of a renderer — `react-test-renderer` ships
 * no type declarations, and `@testing-library/react-native` is not a dependency
 * here.
 */
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (factory: () => unknown) => factory(),
}));

type Row = { id: string };

/** The one real query used here, standing in for any caller's compiled query. */
const REAL_QUERY = CompiledQuery.raw('select "id" from "Drivers" where "user_uuid" = ? limit ?', [
  "user-1",
  1,
]) as CompiledQuery<Row>;

/** Drives the hook once and returns its result. */
function renderTypedQuery(
  compiled: CompiledQuery<Row> | null,
): TypedQueryResult<Row> {
  return useTypedQuery(compiled as any, expectType<Row>());
}

/** The exact call `AbstractPowerSyncDatabase.resolveTables` makes. */
function explain(sql: string, parameters: readonly unknown[] = []) {
  const db = new Database(":memory:");
  try {
    return db.prepare(`EXPLAIN ${sql}`).all(...(parameters as any[])) as {
      opcode: string;
      p2: number;
      p3: number;
    }[];
  } finally {
    db.close();
  }
}

describe("DISABLED_QUERY_SQL", () => {
  it("is not the empty string that produced `EXPLAIN ` / incomplete input", () => {
    expect(DISABLED_QUERY_SQL).not.toBe("");
    expect(DISABLED_QUERY_SQL.trim()).not.toBe("");
  });

  it("reproduces the original failure on the empty string, proving the check bites", () => {
    expect(() => explain("")).toThrow(/incomplete input/i);
  });

  it("survives the `EXPLAIN ${sql}` that resolveTables runs", () => {
    expect(() => explain(DISABLED_QUERY_SQL)).not.toThrow();
  });

  it("resolves zero tables, so no table-change listener is registered", () => {
    // resolveTables' own filter: OpenRead rows with p3 == 0 name the root pages
    // it looks up in sqlite_master. None here means no watched tables at all.
    const openReads = explain(DISABLED_QUERY_SQL).filter(
      (row) => row.opcode === "OpenRead" && row.p3 === 0,
    );
    expect(openReads).toHaveLength(0);
  });

  it("returns no rows, so `data` is [] exactly as callers assume", () => {
    const db = new Database(":memory:");
    try {
      expect(db.prepare(DISABLED_QUERY_SQL).all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe("useTypedQuery", () => {
  it("runs the safe placeholder — never '' — when compiled is null", () => {
    renderTypedQuery(null);

    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const [sql, parameters] = mockUseQuery.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(sql).toBe(DISABLED_QUERY_SQL);
    expect(sql).not.toBe("");
    expect(parameters).toEqual([]);
    // The regression pin proper: whatever the fallback becomes, it must survive
    // the EXPLAIN that PowerSync will run on it.
    expect(() => explain(sql, parameters as unknown[])).not.toThrow();
  });

  it("passes a real compiled query through untouched", () => {
    renderTypedQuery(REAL_QUERY);

    expect(mockUseQuery).toHaveBeenCalledWith(
      REAL_QUERY.sql,
      REAL_QUERY.parameters,
    );
  });

  it("reports isDisabled for a null query and not for a real one", () => {
    expect(renderTypedQuery(null).isDisabled).toBe(true);
    expect(renderTypedQuery(REAL_QUERY).isDisabled).toBe(false);
  });

  it("keeps every field useQuery returned, so existing call sites are unaffected", () => {
    const error = new Error("boom");
    mockUseQuery.mockReturnValueOnce({
      data: [{ id: "driver-1" }],
      isLoading: false,
      isFetching: true,
      error,
    });

    const result = renderTypedQuery(REAL_QUERY);

    expect(result.data).toEqual([{ id: "driver-1" }]);
    expect(result.isLoading).toBe(false);
    expect(result.isFetching).toBe(true);
    expect(result.error).toBe(error);
    expect(result.isDisabled).toBe(false);
  });
});
