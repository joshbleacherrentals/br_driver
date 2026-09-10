/**
 * The `Fixed` badge.
 *
 * One component, because the same fact is rendered in three places (the damage
 * reports list, the inspection summary's damage card, and — once Spec B lands —
 * the shared report card in the "select all that apply" checklist). Three
 * copies of "is this 1 or 0" is how two of them end up disagreeing.
 *
 * The row it reads is `fixed_by_driver`, which is `number | null`: NULL is what
 * a report created on an older client looks like before its first sync
 * round-trip, and it means "not marked", not "unknown".
 */

import React from "react";

import FixedBadge from "@/components/widgets/FixedBadge";

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
  create: (element: React.ReactElement) => { toJSON: () => unknown };
};

type Rendered = ReturnType<typeof TestRenderer.create>;

function render(node: React.ReactElement): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(node);
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

it("marks a report a driver reported fixed", () => {
  expect(allText(render(<FixedBadge fixedByDriver={1} />))).toContain("Fixed");
});

it("renders nothing when no driver has marked it", () => {
  expect(render(<FixedBadge fixedByDriver={0} />).toJSON()).toBeNull();
});

it("treats a not-yet-synced NULL as not marked", () => {
  expect(render(<FixedBadge fixedByDriver={null} />).toJSON()).toBeNull();
});
