/**
 * Handing a tracker back — the single write behind both Decline and Abandon.
 *
 * One function rather than two so that every kind of tracker (trip, repair,
 * site visit) and every screen that offers the buttons (the trips list, the
 * pending list) produce the same row. The office tells the two acts apart by
 * status, and knows when each happened from its own timestamp.
 */

import { db } from "@/library/powersync/db";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import type { WithdrawalAction } from "@/utils/tripWithdrawal";

/**
 * Writes the withdrawal to the local database. Offline-safe: this is a local
 * write like any other, and PowerSync replays it whenever the phone next has a
 * connection.
 *
 * The timestamp is stamped here, by the client, because a server default would
 * record the moment of sync — which on a phone that spent the day in a dead
 * zone is not when the driver gave the work back.
 */
export async function withdrawTracker(
  workTrackerId: string,
  action: WithdrawalAction,
): Promise<void> {
  const now = new Date().toISOString();

  await executeTypedMutationVoid(
    db
      .updateTable("WorkTrackers")
      .set(
        action === "decline"
          ? { status: "declined", declined_at: now, updated_at: now }
          : { status: "abandoned", abandoned_at: now, updated_at: now },
      )
      .where("id", "=", workTrackerId)
      .compile(),
  );
}
