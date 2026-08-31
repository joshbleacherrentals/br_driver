import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * One contact by id, soft-deleted rows excluded.
 *
 * Exported apart from the hook so the SQL can be asserted without a renderer —
 * the repo has no React-hook test harness, and the behavior worth pinning is
 * the query, not the wiring around it.
 *
 * No `scopedFrom`: `Contacts` syncs to a device only through this driver's own
 * `WorkTrackers` (both POC columns are joined back to `WorkTrackers.driver_uuid`
 * in the mobile sync stream), so a stranger's contact is never present locally
 * to be filtered out — the same reasoning as `WorkTrackerLineItems`.
 */
export function buildContactQuery(contactId: string) {
  return db
    .selectFrom("Contacts")
    .select(["id", "first_name", "last_name", "phone", "email"])
    .where("id", "=", contactId)
    .where((eb) =>
      eb.or([eb("deleted", "=", 0), eb("deleted", "is", null)]),
    )
    .limit(1);
}

/** The contact attached to a trip leg, read from the local DB. */
export function useContact(contactId: string | null | undefined): {
  contact: Contact | null;
  isLoading: boolean;
} {
  const compiled = useMemo(
    () => (contactId ? buildContactQuery(contactId).compile() : null),
    [contactId],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Contact>());

  return { contact: data?.[0] ?? null, isLoading };
}
