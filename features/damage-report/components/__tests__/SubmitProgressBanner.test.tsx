/**
 * The submit-progress banner that replaced `SubmitProgressModal`, now narrowed
 * to the local save that happens *before* anything is queued.
 *
 * Three things are worth pinning down:
 *
 * 1. it is **not blocking** — no `Modal`, so the rest of the app stays usable
 *    while photos are written to disk;
 * 2. it is **calm** — the accent family, never `danger`, and no repeating
 *    animation. The overlay's failed state is the alarm; this is not;
 * 3. it says **nothing about uploading**. That story now belongs to
 *    `components/widgets/PhotoUploadStatusOverlay.tsx`, which reports it on
 *    every screen; two banners covering it at once on this one screen is
 *    exactly what the split was made to prevent.
 */

import React from "react";
import { Modal, TouchableOpacity } from "react-native";

import { themes } from "@/constants/theme";
import { SubmitProgressBanner } from "@/features/damage-report/components/SubmitProgressBanner";

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
    root: {
      findAllByType: (type: unknown) => { props: Record<string, unknown> }[];
    };
    toJSON: () => unknown;
    unmount: () => void;
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
  return seen.join("");
}

/** Every color value appearing anywhere in the rendered style tree. */
function allColors(tree: Rendered): string[] {
  const found: string[] = [];
  const readStyle = (style: unknown): void => {
    if (Array.isArray(style)) {
      style.forEach(readStyle);
      return;
    }
    if (style && typeof style === "object") {
      for (const value of Object.values(style as Record<string, unknown>)) {
        if (typeof value === "string") found.push(value);
      }
    }
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const typed = node as {
        props?: Record<string, unknown>;
        children?: unknown;
      };
      readStyle(typed.props?.style);
      if (typeof typed.props?.color === "string") found.push(typed.props.color);
      walk(typed.children);
    }
  };
  walk(tree.toJSON());
  return found;
}

const baseProps = {
  current: 2,
  total: 5,
  onAbort: () => undefined,
};

describe("SubmitProgressBanner", () => {
  it("renders nothing when not visible", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible={false} />);
    expect(tree.toJSON()).toBeNull();
    TestRenderer.act(() => tree.unmount());
  });

  it("does not block the app behind a Modal", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible />);
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    TestRenderer.act(() => tree.unmount());
  });

  it("counts photos actually written to disk", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible />);

    const text = allText(tree);
    expect(text).toContain("Saving photos");
    expect(text).toContain("2 of 5 saved");
    expect(text).toContain("this device");

    TestRenderer.act(() => tree.unmount());
  });

  /**
   * The upload phase moved out wholesale. If this banner starts talking about
   * uploading again, it is duplicating the global overlay.
   */
  it("says nothing about uploading — that is the overlay's job now", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible />);

    expect(allText(tree).toLowerCase()).not.toContain("upload");
    TestRenderer.act(() => tree.unmount());
  });

  it("names photos that could not be saved rather than letting the bar stop short in silence", () => {
    const tree = render(
      <SubmitProgressBanner
        {...baseProps}
        visible
        current={4}
        total={6}
        failedCount={2}
      />,
    );

    expect(allText(tree)).toContain("2 photos could not be saved");
    TestRenderer.act(() => tree.unmount());
  });

  /**
   * Progress is information, not an alarm. Red belongs to the overlay's failed
   * state, which reports photos that are actually lost.
   */
  it("uses the accent family and never the danger token", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible />);

    const colors = allColors(tree);
    expect(colors).toContain(themes.light.accent);
    expect(colors).not.toContain(themes.light.danger);
    expect(colors).not.toContain(themes.dark.danger);

    TestRenderer.act(() => tree.unmount());
  });

  /**
   * The one exit this phase has is destructive — abandoning a report mid-save
   * destroys it — so it stays an explicit, labelled control rather than a
   * close button that could be mistaken for "hide this".
   */
  it("offers the destructive cancel, and only that", () => {
    const tree = render(<SubmitProgressBanner {...baseProps} visible />);

    const labels = tree.root
      .findAllByType(TouchableOpacity)
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(["Cancel damage report"]);

    TestRenderer.act(() => tree.unmount());
  });
});
