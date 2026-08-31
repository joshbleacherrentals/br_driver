/**
 * What the grid shows while a selection is still being imported.
 *
 * The complaint this answers: after accepting thirty photos in the OS picker,
 * the screen looked untouched for tens of seconds. Nothing said the app had the
 * photos and was working through them, so drivers assumed the pick was lost.
 *
 * So while an import is running the grid carries a live count, and both add
 * controls are unavailable — a second picker launched on top of a running
 * import would race the first one's appends.
 */


import React from "react";
import { TouchableOpacity } from "react-native";

import { EditablePhotoGrid } from "@/features/damage-report/components/EditablePhotoGrid";
import type { DocumentPhoto } from "@/features/damage-report/types";

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


describe("EditablePhotoGrid import progress", () => {
  it("shows a live count while photos are being imported", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(7)}
        importing={{ done: 7, total: 30 }}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(allText(tree)).toContain("Adding photos… 7 of 30");
  });

  it("disables both add controls while an import is running", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(2)}
        importing={{ done: 2, total: 30 }}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    for (const control of addControls(tree)) {
      expect(control.props.disabled).toBe(true);
    }
  });

  it("says it is preparing while the total is still unknown", () => {
    // The gap this covers: the OS picker itself takes seconds to hand back a
    // 25-photo selection, and until it does there is no total to count towards.
    // The caller turns the row on before that, so the driver sees the tap take
    // effect the instant the picker closes rather than seconds later.
    const tree = render(
      <EditablePhotoGrid
        photos={[]}
        importing={{ done: 0, total: null }}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(allText(tree)).toContain("Preparing photos…");
    expect(allText(tree)).not.toContain(" of ");
  });

  it("says nothing when no import is running", () => {
    const tree = render(
      <EditablePhotoGrid
        photos={makePhotos(3)}
        onAddFromCamera={() => undefined}
        onAddFromLibrary={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(allText(tree)).not.toContain("Adding photos");
    for (const control of addControls(tree)) {
      expect(control.props.disabled).toBeFalsy();
    }
  });
});
