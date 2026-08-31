/**
 * The compiled INSERT that puts a notice in a ticket's thread.
 *
 * One builder for all three actions, because the row is the same row every
 * time and the three call sites must not drift: same column set (the only one
 * the mobile RLS policy admits), same `is_system = 1`, same `user_uuid`.
 *
 * It returns a compiled statement rather than executing anything. Every caller
 * runs it through the *same* transaction as the change it describes — a notice
 * that committed while the edit behind it failed would be a lie on the board,
 * and nothing re-runs either half afterwards.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping";
import { randomUUID } from "expo-crypto";

import {
  ticketNoticeBody,
  UNKNOWN_TICKET_AUTHOR,
  type TicketAuthor,
  type TicketNoticeKind,
} from "./ticketAuthorNotice";

export type TicketNoticeInput = {
  kind: TicketNoticeKind;
  /** `RoadmapTasks.id` this notice hangs off. */
  taskId: string;
  scope: DriverScope;
  /** `null` when the driver's `Users` row has not synced yet; the body copes. */
  author: TicketAuthor | null;
  /**
   * The same client clock the change itself is stamped with, not a second
   * `Date.now()`: the two rows describe one action and must not appear minutes
   * apart because the phone was busy in between.
   */
  now: number;
};

export function ticketNoticeInsert({
  kind,
  taskId,
  scope,
  author,
  now,
}: TicketNoticeInput) {
  return db
    .insertInto("RoadmapTaskMessages")
    .values({
      id: randomUUID(),
      task_id: taskId,
      user_uuid: scope.userUuid,
      body: ticketNoticeBody(kind, author ?? UNKNOWN_TICKET_AUTHOR),
      // PowerSync mirrors Postgres booleans as 0/1. Always 1: the app wrote
      // this, the driver did not type it, and the board renders system messages
      // as notes rather than as somebody's reply.
      is_system: 1,
      created_at: new Date(now).toISOString(),
    })
    .compile();
}
