/**
 * Correcting a ticket inside the 24-hour window.
 *
 * The statement writes `title` and `description` and nothing else, and it is
 * scoped to the driver who wrote the row. That WHERE clause is not decoration:
 * `RoadmapTasks` is the developers' whole board in Postgres, and the guarantee
 * that a driver can only ever rewrite their own words should hold in the
 * statement itself — not only in the sync rule that decides what reached the
 * phone, which is one config change away from being wider.
 *
 * The edit also posts a notice into the ticket's thread, in the same
 * transaction. The developers' board renders that thread — without a notice a
 * title simply mutates under whoever was reading it, with no trace of who
 * changed it or when.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";

import type { TicketAuthor } from "./ticketAuthorNotice";
import { ticketNoticeInsert } from "./ticketNoticeInsert";
import { canEditTicket } from "./ticketEditWindow";
import { validateTicketText, type TicketTextRejection } from "./ticketText";

export type UpdateBacklogTicketInput = {
  id: string;
  title: string;
  description: string;
  scope: DriverScope;
  /** Names the driver in the notice; `null` until their `Users` row syncs. */
  author: TicketAuthor | null;
  /** The ticket's own `created_at` — what the 24-hour window is measured from. */
  createdAt: string | null;
  now: number;
};

export type UpdateBacklogTicketResult =
  | { ok: true }
  | { ok: false; reason: TicketTextRejection | "edit_window_closed" };

export async function updateBacklogTicket({
  id,
  title,
  description,
  scope,
  author,
  createdAt,
  now,
}: UpdateBacklogTicketInput): Promise<UpdateBacklogTicketResult> {
  const validated = validateTicketText(title, description);
  if (!validated.ok) return validated;

  // Re-checked at submit, not only at render: a driver can sit on an open edit
  // form while the window closes underneath them.
  if (!canEditTicket(createdAt, now)) {
    return { ok: false, reason: "edit_window_closed" };
  }

  await executeTypedTransaction(async (tx) => {
    await tx.run(
      db
        .updateTable("RoadmapTasks")
        .set({
          title: validated.text.title,
          description: validated.text.description,
        })
        .where("id", "=", id)
        .where("created_by_user_uuid", "=", scope.userUuid)
        .compile(),
    );

    // After the change, never before: a notice describing an edit that then
    // failed to apply would be worse on the board than no notice at all.
    await tx.run(
      ticketNoticeInsert({ kind: "edited", taskId: id, scope, author, now }),
    );
  });

  return { ok: true };
}
