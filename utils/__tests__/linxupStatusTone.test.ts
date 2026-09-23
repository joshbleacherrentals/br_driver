/**
 * The colour of the status badge on the Live Location screen — the same
 * three states the web dashboard colours (Moving / Stopped / Idle), and a
 * neutral grey for anything Linxup sends that this build does not know.
 */

import { linxupStatusTone } from "@/utils/eventRoster/linxupStatusTone";

describe("linxupStatusTone", () => {
  it.each([
    ["Moving", "success"],
    ["moving", "success"],
    ["MOVING", "success"],
    ["Stopped", "warning"],
    ["stopped", "warning"],
    ["Idle", "info"],
    ["idle", "info"],
  ])("colours %p as %p", (status, tone) => {
    expect(linxupStatusTone(status)).toBe(tone);
  });

  it.each([null, undefined, "", "Towing", "offline"])(
    "keeps %p neutral rather than guessing",
    (status) => {
      expect(linxupStatusTone(status)).toBe("neutral");
    },
  );
});
