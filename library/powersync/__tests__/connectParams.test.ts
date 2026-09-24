/**
 * The contract with br_powersync/config/sync_rules.yaml.
 *
 * The mobile stream serves two sets of per-trip rules: builds that connect
 * without `sync_version` get the original ones (one bucket per trip), builds
 * that send `sync_version: 2` get the active-trip ones and read finished trips
 * from `WorkTrackers.history_json` (docs/specs/sync-bucket-limit.md §6). This
 * build reads history_json, so sending anything else would leave its Trip
 * History empty.
 */

import { MOBILE_CONNECT_PARAMS } from "@/library/powersync/connectParams";

describe("MOBILE_CONNECT_PARAMS", () => {
  it("identifies the mobile app on sync_version 2", () => {
    expect(MOBILE_CONNECT_PARAMS).toEqual({ app: "mobile", sync_version: 2 });
  });
});
