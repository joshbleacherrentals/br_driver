/**
 * §15 — the write-side opt-out.
 *
 * There is exactly one thing to prove about it: it changes nothing. Its value
 * is social, not runtime — a call site must name a reason, so an unscoped
 * write reads as a decision rather than an oversight, and one grep enumerates
 * every place a driver may change another driver's row.
 */

import { crossDriverWrite } from "@/library/powersync/scoping";

jest.mock("@/library/powersync/db", () => ({
  __esModule: true,
  db: {},
  powerSyncDb: {},
}));

describe("crossDriverWrite", () => {
  it("returns its query untouched", () => {
    const query = { compile: () => ({ sql: "update x", parameters: [] }) };

    expect(crossDriverWrite("a written reason", query)).toBe(query);
  });
});
