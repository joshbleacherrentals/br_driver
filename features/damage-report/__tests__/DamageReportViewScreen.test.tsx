/**
 * The read-only view of somebody else's damage report.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * A driver reaches this from the checklist ("let me look before I tick it")
 * and from the trips screen ("what is wrong with the bleacher I am hauling").
 * Both are someone else's record, and that is the whole design constraint:
 *
 * - nothing here may edit the report or its evidence. The owner's screen keeps
 *   Retry and Replace because those repair THEIR upload queue; offering them
 *   on a report this driver does not own would be offering to rewrite another
 *   driver's evidence;
 * - the `Fixed` control stays, because that is a claim about the bleacher in
 *   front of you, not about the record — any driver who fixed the damage may
 *   say so;
 * - and it degrades to what the device actually holds: thumbnails sync with
 *   the row, full-size photos of another driver's report do not.
 */

import React from "react";

import DamageReportViewScreen from "@/features/damage-report/DamageReportViewScreen";
import type { DamageReportData } from "@/hooks/db/useDamageReport";

const report: { damageReport: DamageReportData | null; isLoading: boolean } = {
  damageReport: null,
  isLoading: false,
};

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

jest.mock("@/hooks/useThemedStyles", () => ({
  __esModule: true,
  useThemedStyles: (factory: (theme: unknown) => unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory(require("@/constants/theme").themes.light),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ damageReportId: "r1" }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("expo-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require("react");
  return {
    __esModule: true,
    Image: (props: Record<string, unknown>) =>
      ReactModule.createElement("PhotoTile", props),
  };
});

jest.mock("@expo/vector-icons", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require("react");
  return {
    __esModule: true,
    Ionicons: (props: Record<string, unknown>) =>
      ReactModule.createElement("Icon", props),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/hooks/db/useDamageReport", () => ({
  __esModule: true,
  useAnyDamageReportById: () => report,
  useDamageReportThumbnails: () => ({
    thumbnails: { r1: ["data:image/jpeg;base64,thumb"] },
    isLoading: false,
  }),
  useDamageReportPhotoPaths: () => ({ photoPaths: ["r1/photo.jpg"], isLoading: false }),
}));

jest.mock("@/hooks/db/useDamageReportAcknowledgements", () => ({
  __esModule: true,
  useAckCounts: () => ({ counts: { r1: 2 }, isLoading: false }),
}));

jest.mock("@/hooks/db/useCurrentUser", () => ({
  __esModule: true,
  useUserDisplayName: () => "Sam Rivera",
}));

jest.mock("@/hooks/db/useBleacher", () => ({
  __esModule: true,
  useBleacher: () => ({ bleacher: { bleacher_number: 412 } }),
}));

jest.mock("@/hooks/useDriverScope", () => ({
  __esModule: true,
  useDriverScope: () => ({ userUuid: "user-a", driverUuid: "driver-a" }),
}));

jest.mock("@/features/damage-report/utils/setDamageReportFixed", () => ({
  __esModule: true,
  markDamageReportFixed: jest.fn(),
  unmarkDamageReportFixed: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => { toJSON: () => unknown };
};

type Rendered = ReturnType<typeof TestRenderer.create>;

function render(): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(<DamageReportViewScreen />);
  });
  return tree;
}

function allText(tree: Rendered): string {
  const seen: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      seen.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      walk((node as { children?: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return seen.join(" ");
}

beforeEach(() => {
  report.damageReport = {
    id: "r1",
    inspection_uuid: null,
    bleacher_uuid: "b1",
    is_safe_to_sit: 0,
    is_safe_to_haul: 1,
    seat_damage: "minor",
    haul_damage: "major",
    note: "Third row plank is split",
    created_at: "2026-09-01T10:00:00.000Z",
    resolved_at: null,
    maintenance_event_uuid: null,
    created_by_user_uuid: "user-b",
    fixed_by_driver: 0,
    fixed_at: null,
    fixed_by_user_uuid: null,
  };
  report.isLoading = false;
});

describe("what the driver can read", () => {
  it("shows the damage itself", () => {
    const text = allText(render());

    expect(text).toContain("Third row plank is split");
    expect(text).toContain("Major");
  });

  it("says whose report it is and how many drivers have confirmed it", () => {
    const text = allText(render());

    expect(text).toContain("Sam Rivera");
    expect(text).toContain("2");
  });

  it("says when the report has gone missing rather than showing blanks", () => {
    report.damageReport = null;

    expect(allText(render())).toContain("not available");
  });
});

describe("what the driver cannot do", () => {
  it("offers no way to edit the report or its evidence", () => {
    const text = allText(render());

    for (const forbidden of ["Retry", "Replace", "Add Photo", "Submit", "Delete"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("still offers the fixed mark — that is a claim about the bleacher", () => {
    expect(allText(render())).toContain("Mark as Fixed");
  });
});
