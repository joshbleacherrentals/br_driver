/**
 * `ContactButton` — the gate, not the sheet.
 *
 * A trip's contact is a customer's personal phone number, so the button that
 * reveals it renders only when three things hold at once, and each of them
 * fails independently in production:
 *
 * 1. the office attached a contact to *this* leg — most trips have no contact
 *    on one or both legs, and `pickup_poc_contact_uuid` is null there;
 * 2. the driver has taken the trip on — a released trip sits in Pending Trips
 *    where the driver has not accepted it yet;
 * 3. the contact row has actually synced down — the uuid arrives on the
 *    `WorkTrackers` row, and the `Contacts` row follows on its own stream, so
 *    there is a real window where the id is known and the row is not.
 *
 * Rendering nothing is the behavior under test in all three cases: a button
 * that opens an empty sheet is worse than no button, and the same rule is
 * already what `PayAmount` does with no line items.
 */

import React from "react";

import { ContactButton } from "@/components/widgets/contactSheet";

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

const mockUseContact = jest.fn();
jest.mock("@/hooks/db/useContact", () => ({
  __esModule: true,
  useContact: (id: string | null | undefined) => mockUseContact(id),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    unmount: () => void;
  };
};

function render(node: React.ReactElement) {
  let tree!: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(node);
  });
  return tree;
}

const DAVE = {
  id: "contact-1",
  first_name: "Dave",
  last_name: "Brubeck",
  phone: "5551234567",
  email: null,
};

function synced() {
  mockUseContact.mockReturnValue({ contact: DAVE, isLoading: false });
}

beforeEach(() => {
  synced();
});

describe("ContactButton", () => {
  it("renders on an accepted trip that has a contact on this leg", () => {
    const tree = render(
      <ContactButton contactId="contact-1" status="accepted" acceptedAt={null} />,
    );

    expect(tree.toJSON()).not.toBeNull();
  });

  it("renders nothing when no contact is attached to this leg", () => {
    const tree = render(
      <ContactButton contactId={null} status="accepted" acceptedAt={null} />,
    );

    expect(tree.toJSON()).toBeNull();
  });

  it("renders nothing on a trip the driver has not accepted", () => {
    const released = render(
      <ContactButton contactId="contact-1" status="released" acceptedAt={null} />,
    );
    expect(released.toJSON()).toBeNull();

    const draft = render(
      <ContactButton contactId="contact-1" status="draft" acceptedAt={null} />,
    );
    expect(draft.toJSON()).toBeNull();
  });

  it("renders nothing on a cancelled trip", () => {
    const tree = render(
      <ContactButton
        contactId="contact-1"
        status="cancelled"
        acceptedAt="2026-08-25T10:00:00Z"
      />,
    );

    expect(tree.toJSON()).toBeNull();
  });

  it("renders nothing while the contact row has not synced down yet", () => {
    mockUseContact.mockReturnValue({ contact: null, isLoading: false });

    const tree = render(
      <ContactButton contactId="contact-1" status="accepted" acceptedAt={null} />,
    );

    expect(tree.toJSON()).toBeNull();
  });

  it("still renders on a completed trip, for review in history", () => {
    const tree = render(
      <ContactButton contactId="contact-1" status="completed" acceptedAt={null} />,
    );

    expect(tree.toJSON()).not.toBeNull();
  });
});
