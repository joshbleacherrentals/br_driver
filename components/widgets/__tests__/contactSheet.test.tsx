/**
 * `ContactSheet` — what the driver sees, and what tapping the number does.
 *
 * The whole point of the feature is the call, so the assertion that matters is
 * the exact URI handed to the OS: `Linking.openURL` with the contact's number
 * normalized to `tel:`. `Contacts.phone` is free text an office user typed, so
 * the punctuation they left behind must not reach the dialer.
 *
 * The two failure paths are as much of the behavior as the happy one. A
 * contact with no usable number must not present a tappable row at all —
 * opening a dialer with an empty field is a dead end the driver cannot
 * recover from. And `canOpenURL` returning false (a tablet with no dialer, a
 * simulator) must not throw an unhandled rejection into the render tree.
 */

import React from "react";
import { Linking, TouchableOpacity } from "react-native";

import { ContactSheet } from "@/components/widgets/contactSheet";

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

jest.mock("@/components/ui/BottomSheetModal", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
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

const mockUseContact = jest.fn();
jest.mock("@/hooks/db/useContact", () => ({
  __esModule: true,
  useContact: (id: string | null | undefined) => mockUseContact(id),
}));

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

/** Every tappable in the sheet except the close button. */
function callRows(tree: Rendered) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) => node.props.accessibilityLabel !== "Close");
}

async function press(node: { props: Record<string, unknown> }) {
  await TestRenderer.act(async () => {
    await (node.props.onPress as () => unknown)();
  });
}

function seedContact(overrides: Record<string, unknown> = {}) {
  mockUseContact.mockReturnValue({
    contact: {
      id: "contact-1",
      first_name: "Dave",
      last_name: "Brubeck",
      phone: "(555) 123-4567",
      email: null,
      ...overrides,
    },
    isLoading: false,
  });
}

let openURL: jest.SpyInstance;
let canOpenURL: jest.SpyInstance;

beforeEach(() => {
  seedContact();
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  canOpenURL = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
});

describe("ContactSheet", () => {
  it("shows the contact's full name", () => {
    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    expect(allText(tree)).toContain("Dave Brubeck");
  });

  it("shows the phone number formatted for reading", () => {
    seedContact({ phone: "5551234567" });

    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    expect(allText(tree)).toContain("(555) 123-4567");
  });

  it("dials the number with the typist's punctuation stripped", async () => {
    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    await press(callRows(tree)[0]);

    expect(openURL).toHaveBeenCalledWith("tel:5551234567");
  });

  it("offers no tappable row when the contact has no number", async () => {
    seedContact({ phone: null });

    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    expect(callRows(tree)).toHaveLength(0);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("offers no tappable row when the number holds no digits", () => {
    seedContact({ phone: "ask the site foreman" });

    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    expect(callRows(tree)).toHaveLength(0);
  });

  it("does not throw when the device has no dialer", async () => {
    canOpenURL.mockResolvedValue(false);

    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    await expect(press(callRows(tree)[0])).resolves.not.toThrow();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("does not throw when the dialer rejects", async () => {
    openURL.mockRejectedValue(new Error("no handler"));

    const tree = render(
      <ContactSheet visible contactId="contact-1" onClose={jest.fn()} />,
    );

    await expect(press(callRows(tree)[0])).resolves.not.toThrow();
  });
});
