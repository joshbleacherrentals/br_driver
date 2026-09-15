/**
 * Finding one bleacher in the whole fleet, by its number.
 *
 * The Assets list is every bleacher the company owns, and the only thing a
 * driver arrives knowing is the number painted on the trailer. So the search
 * answers one question — "where is #212?" — and it has to answer it with the
 * bleacher they typed, not with the first row that happens to contain those
 * digits.
 */

import { searchBleachers } from "@/features/assets/utils/searchBleachers";
import type { AssetListRow } from "@/features/assets/utils/bleacherAssetView";

function row(
  bleacherNumber: string | null,
  id = bleacherNumber ?? "none",
): AssetListRow {
  return {
    id,
    bleacherNumber,
    typeName: null,
    storageLocationName: null,
    zoneName: null,
  };
}

describe("searchBleachers", () => {
  it("shows the whole fleet when nothing has been typed", () => {
    const fleet = [row("12"), row("212"), row("3")];

    expect(searchBleachers(fleet, "")).toEqual(fleet);
    expect(searchBleachers(fleet, "   ")).toEqual(fleet);
  });

  it("puts the bleacher the driver actually typed at the top", () => {
    const hits = searchBleachers([row("120"), row("212"), row("12")], "12");

    expect(hits.map((r) => r.bleacherNumber)).toEqual(["12", "120", "212"]);
  });

  it("ignores the # a driver types out of habit", () => {
    const hits = searchBleachers([row("212"), row("7")], "#212");

    expect(hits.map((r) => r.bleacherNumber)).toEqual(["212"]);
  });

  it("never offers a bleacher the office never numbered", () => {
    expect(searchBleachers([row(null, "blank")], "1")).toEqual([]);
  });

  it("comes back empty rather than guessing when nothing matches", () => {
    expect(searchBleachers([row("212"), row("7")], "999")).toEqual([]);
  });
});
