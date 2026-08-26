/**
 * Filing a backlog ticket: one local row, written offline, replayed to Postgres
 * whenever the phone next has a connection.
 *
 * Two properties of that row are load-bearing.
 *
 * `created_at` is written here rather than left to the Postgres default. The
 * default stamps the moment of *sync*, and both the 24-hour edit window and the
 * daily limit are measured from creation — a ticket filed in a dead zone on
 * Friday would otherwise reset its own window on Monday.
 *
 * The column set is exactly what the mobile RLS policy admits: the driver's own
 * `created_by_user_uuid`, `is_backlog = true`, `status = 'to_do'`. Sprint,
 * feature, assignee and completion are the web roadmap's to set, and a write
 * that reaches for them is rejected — silently, since PowerSync drops fatal
 * rejections from the outbox.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { randomUUID } from "expo-crypto";

import { canCreateTicket } from "./dailyTicketLimit";
import { validateTicketText, type TicketTextRejection } from "./ticketText";

export {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "./ticketText";

export type CreateBacklogTicketInput = {
  title: string;
  description: string;
  /**
   * §15 — a branded `DriverScope`, not a string. `created_by_user_uuid` is what
   * the sync rule, the RLS policy and every read on this feature key off; a
   * ticket attributed to whatever the caller had lying around would sync to
   * nobody's phone and belong to nobody's daily limit.
   */
  scope: DriverScope;
  /**
   * `created_at` of the driver's own tickets — withdrawn ones included — as the
   * screen already has them from `useMyBacklogTickets`. Passed in rather than
   * re-read here so the button's enabled state and this final check can never
   * disagree about the same rule.
   */
  recentCreatedAts: readonly (string | null | undefined)[];
  /** Injected so the window is testable and one render's clock is used once. */
  now: number;
};

export type CreateBacklogTicketResult =
  | { ok: true; id: string }
  | { ok: false; reason: TicketTextRejection | "limit_reached" };

export async function createBacklogTicket({
  title,
  description,
  scope,
  recentCreatedAts,
  now,
}: CreateBacklogTicketInput): Promise<CreateBacklogTicketResult> {
  const validated = validateTicketText(title, description);
  if (!validated.ok) return validated;

  // Re-checked here and not only on the button: the screen's copy of the count
  // can be a render stale, and a dropped write is invisible to the driver.
  if (!canCreateTicket(recentCreatedAts, now)) {
    return { ok: false, reason: "limit_reached" };
  }

  const id = randomUUID();

  await executeTypedMutationVoid(
    db
      .insertInto("RoadmapTasks")
      .values({
        id,
        title: validated.text.title,
        description: validated.text.description,
        status: "to_do",
        // Backlog tickets are unordered — the developers rank them when they
        // pull one into a sprint.
        sort_order: 0,
        // PowerSync mirrors Postgres booleans as 0/1.
        is_backlog: 1,
        created_by_user_uuid: scope.userUuid,
        created_at: new Date(now).toISOString(),
      })
      .compile(),
  );

  return { ok: true, id };
}
