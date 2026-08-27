/**
 * Who filed this ticket, said in a sentence the web roadmap can render.
 *
 * `RoadmapTasks.created_by_user_uuid` already carries the answer as an id, but
 * the developers' board shows a task's title, body and message thread — not its
 * foreign keys. A backlog ticket therefore arrived looking as though it had
 * written itself. The fix is one system message posted alongside the ticket,
 * and this module is the text of it.
 *
 * Three moments post one: filing a ticket, editing it, and withdrawing it. The
 * last two matter as much as the first — a title that changes under a developer
 * who is reading it, or a ticket that simply goes quiet, is otherwise an
 * unexplained event on the board.
 *
 * Everything it names comes from the driver's own `Users` row in the local
 * database, so it is composed offline like the rest of the write. Every field
 * is optional for the same reason: `Users` is synced, and a driver can file a
 * ticket seconds after signing in on a fresh device, before their profile has
 * fully arrived. A shorter notice is the correct outcome there — an absent one
 * is not.
 */

export type TicketAuthor = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * The best name the profile can offer, in the order a human would ask for it:
 * a name, else an email, else a phone number.
 *
 * The last fallback is deliberately a sentence fragment rather than a blank or
 * a raw uuid — the notice still has to read as English on the board, and the
 * message's `user_uuid` is there for anyone who needs the exact person.
 */
export function ticketAuthorLabel(author: TicketAuthor): string {
  const name = [clean(author.firstName), clean(author.lastName)]
    .filter(Boolean)
    .join(" ");

  return (
    name || clean(author.email) || clean(author.phone) || "a driver with no name on file"
  );
}

/** What the driver just did to the ticket. */
export type TicketNoticeKind = "created" | "edited" | "withdrawn";

const OPENING: Record<TicketNoticeKind, string> = {
  created: "Submitted",
  edited: "Edited",
  withdrawn: "Withdrawn",
};

/**
 * The one sentence a notice adds beyond who and what.
 *
 * Only withdrawal gets one, and it is there to stop a reasonable misreading:
 * the ticket does not vanish from the board (the delete is soft), so a
 * developer who finds it still sitting in the backlog needs to be told it is no
 * longer being asked for.
 */
const CLOSING: Partial<Record<TicketNoticeKind, string>> = {
  withdrawn: " The driver no longer considers this worth building.",
};

/**
 * The message body itself.
 *
 * Contact details follow the name in parentheses, minus whichever one was
 * *used* as the name — repeating an email as both subject and parenthetical
 * reads like a bug.
 */
export function ticketNoticeBody(
  kind: TicketNoticeKind,
  author: TicketAuthor,
): string {
  const label = ticketAuthorLabel(author);
  const contacts = [clean(author.email), clean(author.phone)].filter(
    (value): value is string => Boolean(value) && value !== label,
  );

  const suffix = contacts.length ? ` (${contacts.join(" · ")})` : "";
  return `${OPENING[kind]} from the driver app by ${label}${suffix}.${
    CLOSING[kind] ?? ""
  }`;
}

/** The notice a newly filed ticket carries. */
export function ticketAuthorNoticeBody(author: TicketAuthor): string {
  return ticketNoticeBody("created", author);
}

/** The author of a ticket whose `Users` row has not reached the device yet. */
export const UNKNOWN_TICKET_AUTHOR: TicketAuthor = {
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
};
