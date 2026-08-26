/**
 * Correcting a ticket inside the 24-hour window.
 *
 * The statement writes `title` and `description` and nothing else, and it is
 * scoped to the driver who wrote the row. That WHERE clause is not decoration:
 * `RoadmapTasks` is the developers' whole board in Postgres, and the guarantee
 * that a driver can only ever rewrite their own words should hold in the
 * statement itself — not only in the sync rule that decides what reached the
 * phone, which is one config change away from being wider.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import { canEditTicket } from "./ticketEditWindow";
import { validateTicketText, type TicketTextRejection } from "./ticketText";

export type UpdateBacklogTicketInput = {
  id: string;
  title: string;
  description: string;
  scope: DriverScope;
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

  await executeTypedMutationVoid(
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

  return { ok: true };
}
