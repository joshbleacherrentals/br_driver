/**
 * "View Damage Reports (N)" — the trips screen's way into a bleacher's known
 * damage.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * A driver on the road needs to know what has already been reported about the
 * bleacher they are hauling: partly so a dropoff dispute has a paper trail they
 * have seen, partly so they do not file the fourth report about it.
 *
 * The count is the whole affordance. A button that says "View Damage Reports"
 * with nothing behind it wastes a tap on a screen where taps are made in a
 * moving cab, so with no open reports the button is not there at all.
 */

import React from "react";

import ViewDamageReportsButton from "@/components/widgets/ViewDamageReportsButton";

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

function render(props: Partial<React.ComponentProps<typeof ViewDamageReportsButton>> = {}) {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ViewDamageReportsButton count={2} onPress={jest.fn()} {...props} />,
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

it("says how many reports are waiting behind it", () => {
  expect(allText(render({ count: 3 }))).toContain("3");
});

it("is not rendered at all for a bleacher with no open reports", () => {
  expect(render({ count: 0 }).toJSON()).toBeNull();
});

it("opens the list when pressed", () => {
  const onPress = jest.fn();
  const tree = render({ onPress });

  TestRenderer.act(() => {
    tree.root
      .findAll((n) => n.props?.testID === "view-damage-reports")[0]
      .props.onPress();
  });

  expect(onPress).toHaveBeenCalledTimes(1);
});
