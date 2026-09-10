/**
 * The damage report card.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * One card, three readers: the driver picking "which of these is what I am
 * looking at" before filing a report, the driver browsing the reports screen,
 * and the driver checking a bleacher from the trips screen. It is a shared
 * component because the judgement it supports is the same in all three, and a
 * second copy is how the checklist ends up showing less than the list does.
 *
 * What the card has to carry, and why:
 *
 * - the note and a photo strip, because "is this the same damage?" cannot be
 *   answered from a severity badge alone;
 * - the worse of the two ratings, since there is room for one badge;
 * - `confirmed by N drivers`, which is the line that says "known, already
 *   reported" — the whole reason the driver is being shown this list;
 * - and the `Fixed` badge, so a driver who can still see the damage knows
 *   their tick is contradicting someone.
 */

import React from "react";

import DamageReportCard from "@/components/widgets/DamageReportCard";
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    root: {
      findAll: (predicate: (node: any) => boolean) => any[];
      findAllByType: (type: string) => any[];
    };
  };
};

type Rendered = ReturnType<typeof TestRenderer.create>;

const REPORT: DamageReportData = {
  id: "r1",
  inspection_uuid: null,
  bleacher_uuid: "b1",
  is_safe_to_sit: 0,
  is_safe_to_haul: 1,
  seat_damage: "minor",
  haul_damage: "major",
  note: "Third row plank is split end to end",
  created_at: "2026-09-01T10:00:00.000Z",
  resolved_at: null,
  maintenance_event_uuid: null,
  created_by_user_uuid: "user-b",
  fixed_by_driver: 0,
  fixed_at: null,
  fixed_by_user_uuid: null,
};

function render(
  props: Partial<React.ComponentProps<typeof DamageReportCard>> = {},
): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <DamageReportCard report={REPORT} {...props} />,
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

function press(tree: Rendered, testID: string) {
  const node = tree.root.findAll((n) => n.props?.testID === testID)[0];
  TestRenderer.act(() => {
    node.props.onPress();
  });
}

describe("what the card says about the damage", () => {
  it("shows the note, since that is what the reader compares against", () => {
    expect(allText(render())).toContain("Third row plank is split end to end");
  });

  it("shows the worse of the two ratings", () => {
    expect(allText(render())).toContain("Major");
  });

  it("shows the bleacher and the date", () => {
    const text = allText(render({ bleacherNumber: 412 }));

    expect(text).toContain("412");
    expect(text).toContain("2026");
  });

  it("names the driver who filed it when this device knows them", () => {
    expect(allText(render({ authorLabel: "Sam Rivera" }))).toContain("Sam Rivera");
  });

  it("renders without an author rather than printing a blank byline", () => {
    expect(allText(render({ authorLabel: null }))).not.toContain("by ");
  });
});

describe("how many drivers have confirmed it", () => {
  it("says so when others have", () => {
    expect(allText(render({ ackCount: 3 }))).toContain("3");
  });

  it("stays singular for one", () => {
    const text = allText(render({ ackCount: 1 }));

    expect(text).toContain("1 driver");
    expect(text).not.toContain("1 drivers");
  });

  it("says nothing at all when nobody has", () => {
    expect(allText(render({ ackCount: 0 }))).not.toContain("onfirmed");
  });
});

describe("the fixed mark", () => {
  it("is shown, so a tick that contradicts it is a deliberate one", () => {
    const tree = render({
      report: { ...REPORT, fixed_by_driver: 1, fixed_at: "2026-09-05T00:00:00.000Z" },
    });

    expect(allText(tree)).toContain("Fixed");
  });

  it("is absent on a report nobody has marked", () => {
    expect(allText(render())).not.toContain("Fixed");
  });
});

/**
 * Photos deliberately do NOT appear on the card: a strip of thumbnails made
 * every row tall and ragged, and the question the card answers ("is this the
 * same damage?") is carried by the note. The photos live one tap away, on the
 * report itself.
 */
describe("photos", () => {
  it("shows none — they belong on the opened report", () => {
    expect(render().root.findAllByType("PhotoTile")).toHaveLength(0);
  });
});

describe("selecting versus opening", () => {
  it("offers no checkbox unless the caller is collecting a selection", () => {
    expect(
      render().root.findAll((n) => n.props?.testID === "damage-report-card-checkbox"),
    ).toHaveLength(0);
  });

  it("ticks when the card is tapped — that is the frequent gesture", () => {
    // In a selection list, tapping a row means "this one", not "show me more".
    // Ticking is what the driver does to most of the list; opening is the
    // occasional check, so it gets a control rather than the whole surface.
    const onPress = jest.fn();
    const onToggleSelected = jest.fn();
    const tree = render({ selectable: true, onPress, onToggleSelected });

    press(tree, "damage-report-card");

    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("opens the report from its own control", () => {
    const onPress = jest.fn();
    const onToggleSelected = jest.fn();
    const tree = render({ selectable: true, onPress, onToggleSelected });

    press(tree, "damage-report-card-open");

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onToggleSelected).not.toHaveBeenCalled();
  });

  it("opens on tap when there is nothing to select", () => {
    // The trips screen and the reports list: no checkbox, so the card is a
    // link again.
    const onPress = jest.fn();
    const tree = render({ onPress });

    press(tree, "damage-report-card");

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("has no open control when the whole card already opens", () => {
    expect(
      render().root.findAll((n) => n.props?.testID === "damage-report-card-open"),
    ).toHaveLength(0);
  });
});
