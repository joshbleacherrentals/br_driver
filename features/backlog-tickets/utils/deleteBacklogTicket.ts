/**
 * Withdrawing a ticket inside the 24-hour window.
 *
 * Always a soft delete. The row is the team's record of what was reported, and
 * the daily limit counts tickets *created* — withdrawn ones included, matching
 * the Postgres trigger exactly (see `dailyTicketLimit.ts`). A hard delete would
 * quietly hand back a slot the server still considers spent, which is the one
 * failure mode this feature cannot afford: the write that follows would be
 * rejected and dropped without the driver ever seeing it.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import { canEditTicket } from "./ticketEditWindow";

export type DeleteBacklogTicketInput = {
  id: string;
  scope: DriverScope;
  createdAt: string | null;
  now: number;
};

export type DeleteBacklogTicketResult =
  | { ok: true }
  | { ok: false; reason: "edit_window_closed" };

export async function deleteBacklogTicket({
  id,
  scope,
  createdAt,
  now,
}: DeleteBacklogTicketInput): Promise<DeleteBacklogTicketResult> {
  if (!canEditTicket(createdAt, now)) {
    return { ok: false, reason: "edit_window_closed" };
  }

  await executeTypedMutationVoid(
    db
      .updateTable("RoadmapTasks")
      .set({ deleted_at: new Date(now).toISOString() })
      .where("id", "=", id)
      .where("created_by_user_uuid", "=", scope.userUuid)
      .compile(),
  );

  return { ok: true };
}
