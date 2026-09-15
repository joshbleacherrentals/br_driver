/**
 * The one control that hands a tracker back.
 *
 * It is the only destructive button on a trip card, and it appears in two
 * guises depending on where the driver is in the work: *Decline* on an offer
 * they have not taken, *Abandon* once they have. The card shows at most one of
 * them, and on a tracker with no way out it shows nothing at all — drawing a
 * dead Abandon button on a completed job invites a tap that can only confuse.
 *
 * Every path is confirmed first. A driver taps this with gloves on, in a
 * truck, next to Start Trip; a single stray tap that silently handed back the
 * morning's delivery would be unrecoverable from the phone — only the office
 * can put the tracker back.
 *
 * The wording follows the kind of work, because a repair or a site visit is
 * not a "trip" and asking a driver to confirm abandoning a trip they never had
 * reads as a bug.
 */

import React from "react";
import { Alert } from "react-native";

import TripWithdrawalButton from "@/components/widgets/trip/TripWithdrawalButton";

jest.mock("@/hooks/useTheme", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useTheme: () => ({ theme: require("@/constants/theme").themes.light }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    root: {
      findAll: (predicate: (node: any) => boolean) => any[];
    };
  };
};

type Rendered = ReturnType<typeof TestRenderer.create>;

function render(props: {
  status: string | null;
  kind?: "trip" | "repair_maintenance" | "site_visit_cleaning_other";
  onWithdraw?: (action: "decline" | "abandon") => void;
}): Rendered {
  let tree!: Rendered;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TripWithdrawalButton
        status={props.status}
        kind={props.kind ?? "trip"}
        onWithdraw={props.onWithdraw ?? jest.fn()}
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

/** Taps the button the way a driver's thumb would. */
function press(tree: Rendered): void {
  const pressables = tree.root.findAll(
    (node) => typeof node.props?.onPress === "function",
  );
  TestRenderer.act(() => {
    pressables[0].props.onPress();
  });
}

/** The alert the press raised, as (title, message, buttons). */
function lastAlert() {
  const alertMock = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
  const [title, message, buttons] = alertMock.mock.calls.at(-1) ?? [];
  return {
    title: title as string,
    message: message as string,
    buttons: (buttons ?? []) as {
      text?: string;
      style?: string;
      onPress?: () => void;
    }[],
  };
}

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("which button the card shows", () => {
  it("offers Decline on a trip the driver has not taken on", () => {
    expect(allText(render({ status: "released" }))).toContain("Decline");
  });

  it("offers Abandon once the driver owns the work, before and after starting", () => {
    expect(allText(render({ status: "accepted" }))).toContain("Abandon");
    expect(allText(render({ status: "dest_pickup" }))).toContain("Abandon");
    expect(allText(render({ status: "dropoff_inspection" }))).toContain(
      "Abandon",
    );
  });

  it("shows nothing where there is nothing to hand back", () => {
    expect(render({ status: "completed" }).toJSON()).toBeNull();
    expect(render({ status: "declined" }).toJSON()).toBeNull();
    expect(render({ status: null }).toJSON()).toBeNull();
  });
});

describe("confirming before anything is handed back", () => {
  it("asks first and writes nothing on the tap itself", () => {
    const onWithdraw = jest.fn();
    press(render({ status: "accepted", onWithdraw }));

    expect(Alert.alert).toHaveBeenCalled();
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it("hands the tracker back only when the driver confirms", () => {
    const onWithdraw = jest.fn();
    press(render({ status: "accepted", onWithdraw }));

    const confirm = lastAlert().buttons.find((b) => b.style === "destructive");
    TestRenderer.act(() => confirm?.onPress?.());

    expect(onWithdraw).toHaveBeenCalledWith("abandon");
  });

  it("keeps the tracker when the driver backs out", () => {
    const onWithdraw = jest.fn();
    press(render({ status: "released", onWithdraw }));

    const cancel = lastAlert().buttons.find((b) => b.style === "cancel");
    TestRenderer.act(() => cancel?.onPress?.());

    expect(cancel).toBeDefined();
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it("reports the decline as a decline, not an abandonment", () => {
    const onWithdraw = jest.fn();
    press(render({ status: "released", onWithdraw }));

    const confirm = lastAlert().buttons.find((b) => b.style === "destructive");
    TestRenderer.act(() => confirm?.onPress?.());

    expect(onWithdraw).toHaveBeenCalledWith("decline");
  });
});

describe("the words the driver reads", () => {
  it("calls a trip a trip", () => {
    press(render({ status: "accepted", kind: "trip" }));

    const { title, message } = lastAlert();
    expect(title).toContain("Abandon");
    expect(`${title} ${message}`.toLowerCase()).toContain("trip");
  });

  it("calls a repair or a site visit a job, never a trip", () => {
    press(render({ status: "accepted", kind: "repair_maintenance" }));

    const { title, message } = lastAlert();
    const words = `${title} ${message}`.toLowerCase();
    expect(words).toContain("job");
    expect(words).not.toContain("trip");
  });

  // Handing work back is not something a driver can undo from the phone: only
  // the office can reassign it. The confirmation has to say so.
  it("warns that the tracker leaves for good", () => {
    press(render({ status: "released" }));

    expect(lastAlert().message.toLowerCase()).toContain("office");
  });
});
