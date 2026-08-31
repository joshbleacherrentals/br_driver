/**
 * `BleacherConfirmation` — the block at the top of every inspection that asks
 * the driver which bleacher they actually hooked up.
 *
 * Only the rules that protect the data are asserted here: when the picker may
 * still be changed, and when a reason must be given. Layout and copy are not.
 */

import React from "react";

import BleacherConfirmation from "@/components/widgets/inspection/BleacherConfirmation";
import BleacherDropdown from "@/components/widgets/bleacherDropdown";
import type { OrderedBleacher } from "@/utils/orderBleacherOptions";

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

jest.mock("@/hooks/useThemedStyles", () => ({
  __esModule: true,
  useThemedStyles: (make: (theme: unknown) => unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    make(require("@/constants/theme").themes.light),
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
  act: (callback: () => void | Promise<void>) => Promise<void> | void;
  create: (element: React.ReactElement) => {
    root: {
      findAllByType: (type: unknown) => { props: Record<string, unknown> }[];
    };
    toJSON: () => unknown;
  };
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

const ASSIGNED = "b-assigned";
const TAKEN = "b-taken";

const OPTIONS: OrderedBleacher<{
  id: string;
  bleacher_number: string | null;
  zone_uuid: string | null;
  storage_location_uuid: string | null;
  deleted: number | null;
}>[] = [
  {
    id: ASSIGNED,
    bleacher_number: "1",
    zone_uuid: null,
    storage_location_uuid: null,
    deleted: 0,
    group: "assigned",
  },
  {
    id: TAKEN,
    bleacher_number: "4",
    zone_uuid: null,
    storage_location_uuid: null,
    deleted: 0,
    group: "same_location",
  },
];

function setup(overrides: Record<string, unknown> = {}) {
  const onSelect = jest.fn();
  const onReasonChange = jest.fn();
  const tree = render(
    <BleacherConfirmation
      options={OPTIONS}
      assignedBleacherUuid={ASSIGNED}
      selectedUuid={ASSIGNED}
      confirmedBleacherUuid={null}
      reason={null}
      onSelect={onSelect}
      onReasonChange={onReasonChange}
      {...overrides}
    />,
  );
  return { tree, onSelect, onReasonChange };
}

function dropdown(tree: Rendered) {
  const found = tree.root.findAllByType(BleacherDropdown);
  return found[0];
}

/** The reason chips are on screen iff their labels are rendered. */
function asksForReason(tree: Rendered): boolean {
  return allText(tree).includes("Blocked by other bleachers");
}

describe("BleacherConfirmation", () => {
  it("lets the driver change the bleacher before it has been confirmed", () => {
    const { tree } = setup();

    expect(dropdown(tree).props.disabled).toBe(false);
    expect(dropdown(tree).props.selectedUuid).toBe(ASSIGNED);
  });

  it("locks the picker once a bleacher has been confirmed", () => {
    // Pickup settled it; the dropoff inspection only reports it.
    const { tree } = setup({
      confirmedBleacherUuid: TAKEN,
      selectedUuid: TAKEN,
    });

    expect(dropdown(tree).props.disabled).toBe(true);
  });

  it("asks for a reason only when the chosen bleacher is not the assigned one", () => {
    const { tree } = setup({ selectedUuid: TAKEN });

    expect(asksForReason(tree)).toBe(true);
  });

  it("asks for no reason while the assigned bleacher is still chosen", () => {
    const { tree } = setup({ selectedUuid: ASSIGNED });

    expect(asksForReason(tree)).toBe(false);
  });

  it("asks for no reason on an already-confirmed swap", () => {
    // The reason was given when the swap was confirmed; asking again would let
    // a second answer overwrite the first.
    const { tree } = setup({
      selectedUuid: TAKEN,
      confirmedBleacherUuid: TAKEN,
      reason: "damaged",
    });

    expect(asksForReason(tree)).toBe(false);
  });

  it("clears a stale reason when the driver goes back to the assigned bleacher", () => {
    const { tree, onSelect, onReasonChange } = setup({
      selectedUuid: TAKEN,
      reason: "damaged",
    });

    TestRenderer.act(() => {
      (dropdown(tree).props.onChange as (uuid: string) => void)(ASSIGNED);
    });

    expect(onSelect).toHaveBeenCalledWith(ASSIGNED);
    expect(onReasonChange).toHaveBeenCalledWith(null);
  });

  it("keeps the reason when the driver switches between two other bleachers", () => {
    const { tree, onReasonChange } = setup({
      selectedUuid: TAKEN,
      reason: "damaged",
    });

    TestRenderer.act(() => {
      (dropdown(tree).props.onChange as (uuid: string) => void)("b-third");
    });

    expect(onReasonChange).not.toHaveBeenCalled();
  });

  it("names the bleacher the manager assigned, so a swap is a deliberate act", () => {
    const { tree } = setup({ selectedUuid: TAKEN });

    expect(allText(tree)).toContain("#1");
  });
});
