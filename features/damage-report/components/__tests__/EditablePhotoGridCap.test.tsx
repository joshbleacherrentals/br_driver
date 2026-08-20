/**
 * The 30-photo cap as the grid presents it.
 *
 * Kept apart from `EditablePhotoGrid.test.tsx`, which is a locked regression
 * contract about tile windowing and must not grow new concerns.
 *
 * What matters here: at the cap the add controls are genuinely unavailable
 * (disabled, not merely dimmed), the driver is told why in plain words, and a
 * report that is already over the cap still renders and can still be edited
 * down rather than breaking or losing photos.
 */

import React from "react";
import { TouchableOpacity } from "react-native";

import { EditablePhotoGrid } from "@/features/damage-report/components/EditablePhotoGrid";
import type { DocumentPhoto } from "@/features/damage-report/types";
import { MAX_PHOTOS } from "@/utils/photoLimit";

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

// See the note in `library/powersync/__tests__/typedQuery.test.ts` — this
// project has no `@testing-library/react-native`, so the renderer is required
// and given the minimal shape used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    root: {
      findAllByType: (type: unknown) => { props: Record<string, unknown> }[];
    };
    unmount: () => void;
  };
};

function makePhotos(count: number): DocumentPhoto[] {
  return Array.from({ length: count }, (_unused, index) => ({
    uri: `file:///photos/photo-${index}.jpg`,
    previewUri: `file:///photos/preview-${index}.jpg`,
    isNew: true,
  }));
}

type Rendered = ReturnType<typeof TestRenderer.create>;

function render(node: React.ReactElement): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(node);
  });
  return tree;
}

/** Every string rendered anywhere in the tree, flattened for substring checks. */
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
      // `toJSON()` nodes carry `children` alongside `props`, not inside it.
      walk((node as { children?: unknown }).children);
    }
  };
  // `findAllByType` on the host `Text` is not available without a type import
  // here, so the JSON tree is walked instead.
  walk((tree as unknown as { toJSON: () => unknown }).toJSON());
  // Joined with nothing: a `<Text>` splits interpolations into separate
  // fragments, and any separator would break up the very strings being matched.
  return seen.join("");
}

/**
 * The add controls are the first two `TouchableOpacity` elements in the grid —
 * "Take Photo" and "Choose from Library". Identified by their accessibility
 * label rather than position so a future tile control cannot silently shift
 * what this asserts on.
 */
function addControls(tree: Rendered) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) =>
      ["Take Photo", "Choose from Library"].includes(
        String(node.props.accessibilityLabel),
      ),
    );
}

describe("EditablePhotoGrid photo cap", () => {
  it("leaves both add controls enabled below the cap", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(MAX_PHOTOS - 1)}
        maxPhotos={MAX_PHOTOS}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    const controls = addControls(tree);
    expect(controls).toHaveLength(2);
    expect(controls.every((c) => c.props.disabled === true)).toBe(false);
    expect(allText(tree)).not.toContain("Maximum");

    TestRenderer.act(() => tree.unmount());
  });

  it("disables camera and library once the cap is reached, and says why", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(MAX_PHOTOS)}
        maxPhotos={MAX_PHOTOS}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    const controls = addControls(tree);
    expect(controls).toHaveLength(2);
    // Both paths, not just the library one — a cap that only stops bulk picks
    // is not a cap.
    expect(controls.every((c) => c.props.disabled === true)).toBe(true);

    const text = allText(tree);
    expect(text).toContain("Maximum 30 photos per report");
    expect(text).not.toMatch(/error|invalid|failed/i);

    TestRenderer.act(() => tree.unmount());
  });

  /**
   * The edge case that must not break: a report predating the cap. Nothing is
   * deleted or hidden, removal still works, adding is simply closed.
   */
  it("still renders and allows removing on a report already over the cap", () => {
    const onRemove = jest.fn();
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(MAX_PHOTOS + 12)}
        maxPhotos={MAX_PHOTOS}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={onRemove}
      />,
    );

    expect(addControls(tree).every((c) => c.props.disabled === true)).toBe(true);

    // Tiles are windowed, so not all 42 mount — but the ones that do are
    // removable, and the count in the header is the true one.
    const tiles = tree.root.findAllByType("PhotoTile" as unknown);
    expect(tiles.length).toBeGreaterThan(0);
    expect(allText(tree)).toContain("42 of 30");

    const removeButtons = tree.root
      .findAllByType(TouchableOpacity)
      .filter((node) => node.props.accessibilityLabel === undefined);
    expect(removeButtons.length).toBeGreaterThan(0);
    TestRenderer.act(() => {
      (removeButtons[0].props.onPress as () => void)();
    });
    expect(onRemove).toHaveBeenCalled();

    TestRenderer.act(() => tree.unmount());
  });

  /**
   * The grid is a dumb renderer of whatever cap it is handed: every caller in
   * the app passes one today (damage reports and inspection photo questions
   * alike), but an omitted `maxPhotos` must still change nothing at all.
   */
  it("stays uncapped when no maxPhotos is given", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(MAX_PHOTOS + 5)}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(addControls(tree).some((c) => c.props.disabled === true)).toBe(false);
    const text = allText(tree);
    expect(text).not.toContain("Maximum");
    expect(text).not.toContain("of 30");

    TestRenderer.act(() => tree.unmount());
  });
});
