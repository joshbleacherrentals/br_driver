/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * This test defines expected behavior for a diagnosed bug/regression in the
 * photo upload queue (see the "Photo Queue Postmortem" plan). It must stay
 * red until the corresponding fix lands, and must not be edited, weakened,
 * skipped, or deleted to make broken implementation code pass. If you are
 * an agent implementing the fix and believe this test is wrong, STOP and
 * ask the user — do not change this file yourself.
 *
 * Seam under test: `features/damage-report/components/EditablePhotoGrid.tsx` —
 * how many photo tiles it mounts for a large photo array.
 * Currently: RED — the grid maps every photo into a plain wrapping `View`, so
 * all 300 tiles (and their `expo-image` instances) mount at once.
 */

import React from "react";

import { themes } from "@/constants/theme";
import { EditablePhotoGrid } from "@/features/damage-report/components/EditablePhotoGrid";
import type { DocumentPhoto } from "@/features/damage-report/types";

/**
 * The grid's only context dependency. Mocked rather than wrapped in the real
 * provider so this test measures the grid and nothing else; the tokens handed
 * back are the real light palette.
 */
jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

/** A tile marker that survives whatever list component the grid ends up using. */
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

/**
 * `react-test-renderer` ships no type declarations, and
 * `@testing-library/react-native` is not a dependency of this project (see the
 * note in `library/powersync/__tests__/typedQuery.test.ts`), so the renderer is
 * required and given the minimal shape this test uses.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    root: { findAllByType: (type: string) => unknown[] };
    unmount: () => void;
  };
};

/** A damage report backlog large enough that mounting it all is the bug. */
const PHOTO_COUNT = 300;

const photos: DocumentPhoto[] = Array.from(
  { length: PHOTO_COUNT },
  (_unused, index) => ({
    uri: `file:///photos/photo-${index}.jpg`,
    previewUri: `file:///photos/preview-${index}.jpg`,
    isNew: true,
  }),
);

describe("EditablePhotoGrid virtualization", () => {
  it("mounts only a window of tiles, not one per photo", () => {
    // Referenced so the palette import is unmistakably the real one the mock
    // hands back.
    expect(themes.light).toBeDefined();

    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <EditablePhotoGrid
          photos={photos}
          onAddFromCamera={() => undefined}
          onAddFromLibrary={() => undefined}
          onRemove={() => undefined}
        />,
      );
    });

    const tiles = tree.root.findAllByType("PhotoTile");
    TestRenderer.act(() => {
      tree.unmount();
    });

    // A virtualized list mounts an initial window and grows it as the user
    // scrolls; a plain `.map()` mounts all 300 image views up front, which is
    // what puts hundreds of decoded bitmaps in memory at once.
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(PHOTO_COUNT);
  });
});
