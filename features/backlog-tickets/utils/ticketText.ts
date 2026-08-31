/**
 * What counts as usable ticket text — shared by creation and editing so the two
 * paths cannot drift apart.
 *
 * The caps are the web roadmap's, not arbitrary: a title is a card heading on
 * the developers' board and a 500-character one destroys that layout, while the
 * description is read in a detail pane that scrolls.
 */

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;

export type TicketTextRejection =
  | "empty_title"
  | "empty_description"
  | "title_too_long"
  | "description_too_long";

export type TicketText = { title: string; description: string };

export type TicketTextResult =
  | { ok: true; text: TicketText }
  | { ok: false; reason: TicketTextRejection };

/**
 * Trims both fields and checks them.
 *
 * Trimming happens *before* the length check, so trailing whitespace can never
 * be what pushes a title over the cap. Both fields are required: a ticket with
 * a title and no body is a support request nobody can act on.
 */
export function validateTicketText(
  title: string,
  description: string,
): TicketTextResult {
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();

  if (!trimmedTitle) return { ok: false, reason: "empty_title" };
  if (!trimmedDescription) return { ok: false, reason: "empty_description" };
  if (trimmedTitle.length > TITLE_MAX_LENGTH) {
    return { ok: false, reason: "title_too_long" };
  }
  if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
    return { ok: false, reason: "description_too_long" };
  }

  return {
    ok: true,
    text: { title: trimmedTitle, description: trimmedDescription },
  };
}
