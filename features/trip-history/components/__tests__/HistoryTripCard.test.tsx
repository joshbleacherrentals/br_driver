/**
 * Telling apart the three ways a tracker can end up in history.
 *
 * A completed trip, a declined offer and an abandoned job all land in the same
 * list, and without a word on the card the last two read as a trip that paid
 * nothing — which is exactly the reading that starts a call to the office.
 * Each of the two withdrawals therefore says what it was, and neither shows a
 * pay figure: the money belongs to work that was done.
 */

import React from "react";

import HistoryTripCard from "@/features/trip-history/components/HistoryTripCard";
import { themes } from "@/constants/theme";
import type { WorkTracker } from "@/hooks/db/useWorkTrackers";

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

function render(status: string): Rendered {
  const trip = {
    id: "wt-1",
    status,
    date: "2026-09-09",
    pay_cents: 25_000,
    pickup_address_uuid: null,
    dropoff_address_uuid: null,
  } as WorkTracker;

  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <HistoryTripCard
        trip={trip}
        kind="trip"
        bleacherNumber="42"
        pickupAddress={null}
        dropoffAddress={null}
        payLabel={status === "completed" ? "$250.00" : null}
        dateLabel="Wed, Sep 9th"
        isLast
        theme={themes.light}
        onPress={jest.fn()}
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

describe("what the card says a tracker was", () => {
  it("says a declined trip was declined", () => {
    expect(allText(render("declined"))).toContain("Declined");
  });

  it("says an abandoned job was abandoned", () => {
    expect(allText(render("abandoned"))).toContain("Abandoned");
  });

  // Completed work is the norm here; a badge on every card would be noise and
  // would bury the two that matter.
  it("says nothing extra about work that was simply done", () => {
    const text = allText(render("completed"));

    expect(text).not.toContain("Declined");
    expect(text).not.toContain("Abandoned");
    expect(text).toContain("$250.00");
  });
});
