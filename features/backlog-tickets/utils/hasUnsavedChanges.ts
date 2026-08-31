/**
 * Whether leaving the ticket screen would throw away work.
 *
 * Kept as a pure function rather than a `dirty` flag flipped in an `onChange`
 * handler, because the same answer is needed from three places that fire at
 * different times — the Cancel button, the header's back chevron, and the
 * gesture guard that decides whether swiping back is allowed at all. A flag
 * would be a fourth thing to keep in step with the two fields.
 *
 * Compared on trimmed text: whitespace the driver cannot see is not a change
 * worth interrupting them over, and a prompt that fires when nothing was typed
 * is the kind of prompt people learn to dismiss without reading.
 */

export type TicketDraft = { title: string; description: string };

export type TicketScreenMode = "create" | "view" | "edit";

export function hasUnsavedChanges(
  mode: TicketScreenMode,
  draft: TicketDraft,
  saved: TicketDraft | null,
): boolean {
  if (mode === "view") return false;

  const title = draft.title.trim();
  const description = draft.description.trim();

  if (mode === "create") {
    return title.length > 0 || description.length > 0;
  }

  // Editing with no saved row to compare against — the ticket has not synced
  // yet, or has just been withdrawn. Anything on screen is unsaved by
  // definition; err towards asking.
  if (!saved) return title.length > 0 || description.length > 0;

  return title !== saved.title.trim() || description !== saved.description.trim();
}
