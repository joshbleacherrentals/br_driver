/**
 * "Select all that apply" — the list a driver sees before filing a report.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * This is the whole intervention: managers were getting three to five reports
 * about one piece of damage because every driver who saw it was required to
 * report it. Showing the open reports first, with photos and notes, is what
 * turns the fourth report into a tick.
 *
 * So the behaviours worth pinning are about not getting in the way:
 *
 * - ticking a report and opening it are different gestures, because a driver
 *   has to be able to look before deciding;
 * - the same list is used read-only from the trips screen, where a checkbox
 *   would offer something that does nothing;
 * - and a bleacher with no open reports says so plainly, because the driver's
 *   next move there is to file a new report, not to hunt for a list.
 */

import React from "react";

import ExistingDamageChecklist from "@/components/widgets/ExistingDamageChecklist";
import type { DamageReportData } from "@/hooks/db/useDamageReport";

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
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

const mockReports: { damageReports: DamageReportData[]; isLoading: boolean } = {
  damageReports: [],
  isLoading: false,
};
const mockCounts: { counts: Record<string, number> } = { counts: {} };

jest.mock("@/hooks/db/useDamageReport", () => ({
  __esModule: true,
  useDamageReports: () => mockReports,
  useDamageReportThumbnails: () => ({ thumbnails: {}, isLoading: false }),
}));

jest.mock("@/hooks/db/useDamageReportAcknowledgements", () => ({
  __esModule: true,
  useAckCounts: () => mockCounts,
}));

jest.mock("@/hooks/db/useCurrentUser", () => ({
  __esModule: true,
  useUserDisplayNames: () => ({ "user-b": "Sam Rivera" }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    root: { findAll: (predicate: (node: any) => boolean) => any[] };
  };
};

type Rendered = ReturnType<typeof TestRenderer.create>;

function reportFixture(id: string, note: string): DamageReportData {
  return {
    id,
    inspection_uuid: null,
    bleacher_uuid: "b1",
    is_safe_to_sit: 0,
    is_safe_to_haul: 1,
    seat_damage: "minor",
    haul_damage: "none",
    note,
    created_at: "2026-09-01T10:00:00.000Z",
    resolved_at: null,
    maintenance_event_uuid: null,
    created_by_user_uuid: "user-b",
    fixed_by_driver: 0,
    fixed_at: null,
    fixed_by_user_uuid: null,
  };
}

function render(
  props: Partial<React.ComponentProps<typeof ExistingDamageChecklist>> = {},
): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ExistingDamageChecklist
        bleacherUuid="b1"
        selectedIds={[]}
        onToggle={jest.fn()}
        onOpenReport={jest.fn()}
        {...props}
      />,
    );
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

/**
 * Locators.
 *
 * Reaching a card through the `report` prop rather than by position: a
 * `TouchableOpacity` appears more than once in the rendered tree, so an index
 * into a flat `findAll` of testIDs silently points at the wrong card — which is
 * precisely the bug these tests exist to catch.
 */
function cardFor(tree: Rendered, reportId: string) {
  return tree.root.findAll((n) => n.props?.report?.id === reportId)[0];
}

function pressWithin(node: any, testID: string) {
  const target = node.findAll(
    (n: any) =>
      n.props?.testID === testID && typeof n.props?.onPress === "function",
  )[0];

  TestRenderer.act(() => {
    target.props.onPress();
  });
}

function checkboxes(tree: Rendered) {
  return tree.root.findAll(
    (n) =>
      n.props?.testID === "damage-report-card-checkbox" &&
      typeof n.props?.onPress === "function",
  );
}

beforeEach(() => {
  mockReports.damageReports = [
    reportFixture("r1", "Third row plank is split"),
    reportFixture("r2", "Handrail bracket loose"),
  ];
  mockReports.isLoading = false;
  mockCounts.counts = {};
});

describe("the list itself", () => {
  it("shows every open report on the bleacher", () => {
    const text = allText(render());

    expect(text).toContain("Third row plank is split");
    expect(text).toContain("Handrail bracket loose");
  });

  it("names who filed each one", () => {
    expect(allText(render())).toContain("Sam Rivera");
  });

  it("passes on how many drivers already confirmed a report", () => {
    mockCounts.counts = { r1: 2 };

    expect(allText(render())).toContain("Confirmed by 2 drivers");
  });

  it("says plainly when the bleacher has no open reports", () => {
    mockReports.damageReports = [];

    expect(allText(render())).toContain("No open damage reports");
  });
});

describe("ticking versus looking", () => {
  it("reports which one was ticked", () => {
    const onToggle = jest.fn();
    const tree = render({ onToggle });

    pressWithin(cardFor(tree, "r2"), "damage-report-card");

    expect(onToggle).toHaveBeenCalledWith("r2");
  });

  it("opens the one whose Open control was used", () => {
    const onOpenReport = jest.fn();
    const tree = render({ onOpenReport });

    pressWithin(cardFor(tree, "r1"), "damage-report-card-open");

    expect(onOpenReport).toHaveBeenCalledWith("r1");
  });

  it("offers no checkboxes when it is only there to be read", () => {
    // The trips screen: a driver checking what is wrong with the bleacher they
    // are hauling has nothing to select.
    expect(checkboxes(render({ mode: "view" }))).toHaveLength(0);
  });

  it("still opens reports in read-only mode", () => {
    const onOpenReport = jest.fn();
    const tree = render({ mode: "view", onOpenReport });

    pressWithin(cardFor(tree, "r2"), "damage-report-card");

    expect(onOpenReport).toHaveBeenCalledWith("r2");
  });
});
