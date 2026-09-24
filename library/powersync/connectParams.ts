/**
 * Client parameters this app connects to PowerSync with.
 *
 * `app` picks the mobile stream. `sync_version` picks which per-trip rules in
 * br_powersync/config/sync_rules.yaml this build gets. 2 is the active-trip
 * rules, with finished trips read from `WorkTrackers.history_json`
 * (docs/specs/sync-bucket-limit.md). Builds without it get the original
 * one-bucket-per-trip rules.
 */
export const MOBILE_CONNECT_PARAMS = {
  app: "mobile",
  sync_version: 2,
} as const;
