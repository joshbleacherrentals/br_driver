/**
 * The driver's own backlog tickets — the read side of "Direct Line to
 * Developers".
 *
 * One query answers both questions the feature asks, on purpose. The list needs
 * live tickets; the create button needs how many tickets were *filed* in the
 * last 24 hours, withdrawn ones included (see `dailyTicketLimit.ts` — the count
 * has to match the Postgres trigger exactly). Two queries would be two chances
 * for those to disagree mid-render, so the rows are fetched once and split in
 * memory.
 */

import { useDriverScope } from "@/hooks/useDriverScope";
import { backlogTicketsOf } from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type BacklogTicketData = {
  id: string;
  title: string | null;
  description: string | null;
  created_at: string | null;
  deleted_at: string | null;
};

const BACKLOG_TICKET_COLUMNS = [
  "id",
  "title",
  "description",
  "created_at",
  "deleted_at",
] as const;

export type MyBacklogTickets = {
  /** Live tickets, newest first — what the list screen renders. */
  tickets: BacklogTicketData[];
  /**
   * `true` while there is no driver scope yet, so no query has been built.
   *
   * Distinct from `isLoading`, and both mean "do not trust the emptiness of
   * this result": a caller that reads `[]` as "this driver has filed nothing"
   * would hand the daily-limit check a clean slate and let a fourth ticket
   * through, which the Postgres trigger rejects and PowerSync then drops in
   * silence.
   */
  isDisabled: boolean;
  /**
   * `created_at` of every ticket this driver has filed, withdrawn ones
   * included. Feeds the daily limit; see the module header.
   */
  createdAts: (string | null)[];
  isLoading: boolean;
};

export function useMyBacklogTickets(): MyBacklogTickets {
  const scope = useDriverScope();

  const compiled = useMemo(() => {
    if (!scope) return null;

    return backlogTicketsOf(scope)
      .select([...BACKLOG_TICKET_COLUMNS])
      .orderBy("created_at", "desc")
      .compile();
  }, [scope]);

  const { data, isLoading, isDisabled } = useTypedQuery(
    compiled,
    expect<BacklogTicketData>(),
  );

  return useMemo(() => {
    const rows = data ?? [];
    return {
      tickets: rows.filter((row) => !row.deleted_at),
      createdAts: rows.map((row) => row.created_at),
      isDisabled,
      isLoading,
    };
  }, [data, isLoading, isDisabled]);
}

/**
 * One ticket by id.
 *
 * `ticket` is `null` in three different situations and the caller has to tell
 * them apart: the query has not answered yet (`isLoading`), there is no driver
 * scope to build it from (`isDisabled`), or the row genuinely is not this
 * driver's — which the scoped source refuses rather than trusts. Only the last
 * one means "unavailable"; rendering that message for the other two is a lie
 * the driver sees on every open.
 */
export function useBacklogTicket(id: string | null | undefined): {
  ticket: BacklogTicketData | null;
  isLoading: boolean;
  isDisabled: boolean;
} {
  const scope = useDriverScope();

  const compiled = useMemo(() => {
    if (!scope || !id) return null;

    return backlogTicketsOf(scope)
      .select([...BACKLOG_TICKET_COLUMNS])
      .where("id", "=", id)
      .limit(1)
      .compile();
  }, [scope, id]);

  const { data, isLoading, isDisabled } = useTypedQuery(
    compiled,
    expect<BacklogTicketData>(),
  );

  return { ticket: data?.[0] ?? null, isLoading, isDisabled };
}
