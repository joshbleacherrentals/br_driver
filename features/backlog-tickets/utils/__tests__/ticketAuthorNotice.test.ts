/**
 * The notice is the only place the web roadmap learns *who* filed a backlog
 * ticket. `RoadmapTasks.created_by_user_uuid` carries the id, but the board
 * renders a task's thread, not its foreign keys — so a ticket with no notice
 * reads as having appeared from nowhere.
 *
 * Everything the notice names comes from the local `Users` row, which is why
 * every field is optional here: a driver whose profile is half-filled still
 * gets a notice, just a shorter one.
 */

import {
  ticketAuthorLabel,
  ticketAuthorNoticeBody,
  ticketNoticeBody,
  UNKNOWN_TICKET_AUTHOR,
  type TicketAuthor,
} from "@/features/backlog-tickets/utils/ticketAuthorNotice";

const author: TicketAuthor = {
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  phone: "+1 555 111 2222",
};

describe("ticketAuthorLabel", () => {
  it("uses the driver's full name when there is one", () => {
    expect(ticketAuthorLabel(author)).toBe("John Doe");
  });

  it("uses whichever half of the name exists", () => {
    expect(ticketAuthorLabel({ ...author, lastName: null })).toBe("John");
    expect(ticketAuthorLabel({ ...author, firstName: "  " })).toBe("Doe");
  });

  it("falls back to the email, then the phone", () => {
    const nameless = { ...author, firstName: null, lastName: null };
    expect(ticketAuthorLabel(nameless)).toBe("john@example.com");
    expect(ticketAuthorLabel({ ...nameless, email: null })).toBe(
      "+1 555 111 2222",
    );
  });

  it("still names something when the profile carries nothing at all", () => {
    expect(
      ticketAuthorLabel({
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
      }),
    ).toBe("a driver with no name on file");
  });
});

describe("ticketAuthorNoticeBody", () => {
  it("names the driver and both ways to reach them", () => {
    expect(ticketAuthorNoticeBody(author)).toBe(
      "Submitted from the driver app by John Doe (john@example.com · +1 555 111 2222).",
    );
  });

  it("does not repeat a contact detail that is already the name", () => {
    expect(
      ticketAuthorNoticeBody({
        ...author,
        firstName: null,
        lastName: null,
        phone: null,
      }),
    ).toBe("Submitted from the driver app by john@example.com.");
  });

  it("omits the parenthetical when there is nothing to put in it", () => {
    expect(
      ticketAuthorNoticeBody({
        firstName: "John",
        lastName: "Doe",
        email: null,
        phone: null,
      }),
    ).toBe("Submitted from the driver app by John Doe.");
  });

  it("trims what the profile stored", () => {
    expect(
      ticketAuthorNoticeBody({
        firstName: "  John ",
        lastName: " Doe  ",
        email: " john@example.com ",
        phone: null,
      }),
    ).toBe("Submitted from the driver app by John Doe (john@example.com).");
  });
});

/**
 * Editing and withdrawing post their own notice, for the same reason creation
 * does: the board shows the thread, so a title that changes under a developer's
 * eyes — or a ticket that goes quiet because it was withdrawn — has to say so
 * in the thread rather than only in a column nobody renders.
 */
describe("ticketNoticeBody", () => {
  it("says what happened, and by whom, for each kind", () => {
    expect(ticketNoticeBody("created", author)).toBe(
      "Submitted from the driver app by John Doe (john@example.com · +1 555 111 2222).",
    );
    expect(ticketNoticeBody("edited", author)).toBe(
      "Edited from the driver app by John Doe (john@example.com · +1 555 111 2222).",
    );
    expect(ticketNoticeBody("withdrawn", author)).toBe(
      "Withdrawn from the driver app by John Doe (john@example.com · +1 555 111 2222). The driver no longer considers this worth building.",
    );
  });

  it("degrades the same way creation does when the profile is empty", () => {
    expect(ticketNoticeBody("edited", UNKNOWN_TICKET_AUTHOR)).toBe(
      "Edited from the driver app by a driver with no name on file.",
    );
  });

  it("is the same sentence creation already wrote", () => {
    expect(ticketNoticeBody("created", author)).toBe(
      ticketAuthorNoticeBody(author),
    );
  });
});
