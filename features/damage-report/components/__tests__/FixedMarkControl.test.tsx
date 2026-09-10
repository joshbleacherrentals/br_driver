/**
 * The "Fixed" control on a damage report.
 *
 * Spec: docs/specs/driver-fixed-damage-reports.md
 *
 * It lives beside `Done`, and everything worth pinning here is about the
 * distance between a tap and a write:
 *
 * 1. one confirmation stands between the two. The mark is visible to managers
 *    and to every other driver, and a fat-fingered `Fixed` on a real hazard is
 *    the failure that matters — so the callback must not fire until the driver
 *    says yes;
 * 2. the control states what it will do, not what it did: `Mark as Fixed` when
 *    the report is unmarked, `Unmark Fixed` when it is already marked;
 * 3. a marked report always says who and when, degrading to just the date when
 *    the person's row is not on this device. Offline, that is common — and a
 *    missing name must not cost the driver the banner.
 */

import React from "react";
import { Alert } from "react-native";

import { FixedMarkControl } from "@/features/damage-report/components/FixedMarkControl";

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

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
    root: { findAll: (predicate: (node: any) => boolean) => any[] };
  };
};

type Rendered = ReturnType<typeof TestRenderer.create>;
type AlertButton = { text?: string; onPress?: () => void };

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

function pressTheButton(tree: Rendered) {
  const button = tree.root.findAll(
    (node) => node.props?.testID === "fixed-mark-button",
  )[0];
  TestRenderer.act(() => {
    button.props.onPress();
  });
}

function render(
  props: Partial<React.ComponentProps<typeof FixedMarkControl>> = {},
): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <FixedMarkControl
        isFixed={false}
        fixedAt={null}
        fixedByLabel={null}
        onMark={jest.fn()}
        onUnmark={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("what the control offers", () => {
  it("offers to mark an unmarked report", () => {
    expect(allText(render())).toContain("Mark as Fixed");
  });

  it("offers to undo the mark on a marked one", () => {
    const tree = render({
      isFixed: true,
      fixedAt: "2026-09-09T10:00:00.000Z",
      fixedByLabel: "Sam Rivera",
    });

    expect(allText(tree)).toContain("Unmark Fixed");
    expect(allText(tree)).not.toContain("Mark as Fixed");
  });

  it("says who marked it", () => {
    const tree = render({
      isFixed: true,
      fixedAt: "2026-09-09T10:00:00.000Z",
      fixedByLabel: "Sam Rivera",
    });

    expect(allText(tree)).toContain("Sam Rivera");
  });

  it("still shows the banner when the person is unknown to this device", () => {
    const tree = render({
      isFixed: true,
      fixedAt: "2026-09-09T10:00:00.000Z",
      fixedByLabel: null,
    });

    expect(allText(tree)).toContain("Fixed");
    expect(allText(tree)).not.toContain("null");
  });

  it("shows no banner at all on an unmarked report", () => {
    expect(allText(render())).not.toContain("Fixed by");
  });
});

describe("the confirmation between the tap and the write", () => {
  it("asks before marking", () => {
    const onMark = jest.fn();
    pressTheButton(render({ onMark }));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onMark).not.toHaveBeenCalled();
  });

  it("marks once the driver confirms", () => {
    const onMark = jest.fn();
    pressTheButton(render({ onMark }));

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.text === "Yes")?.onPress?.();

    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the driver backs out", () => {
    const onMark = jest.fn();
    pressTheButton(render({ onMark }));

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.text === "No")?.onPress?.();

    expect(onMark).not.toHaveBeenCalled();
  });

  it("asks before undoing the mark too", () => {
    const onUnmark = jest.fn();
    pressTheButton(
      render({
        isFixed: true,
        fixedAt: "2026-09-09T10:00:00.000Z",
        fixedByLabel: "Sam Rivera",
        onUnmark,
      }),
    );

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onUnmark).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.text === "Yes")?.onPress?.();

    expect(onUnmark).toHaveBeenCalledTimes(1);
  });
});
