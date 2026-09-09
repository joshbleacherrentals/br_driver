/**
 * The signed-in driver's own `Users` row — the human-readable half of who this
 * device belongs to (name, email, phone), as opposed to the two ids
 * `useDriverScope()` carries.
 *
 * Read from the local database like everything else, so it is available with
 * the phone offline. It can still be `null`: `Users` arrives by sync, and there
 * is a window on a fresh sign-in where the scope has resolved but the row has
 * not landed. Callers must have an answer for that window rather than assuming
 * a name is always there.
 */

import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export type CurrentUserIdentity = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

export function useCurrentUser(): { identity: CurrentUserIdentity | null } {
  const scope = useDriverScope();

  const compiled = useMemo(() => {
    if (!scope) return null;

    return db
      .selectFrom("Users")
      .select(["id", "first_name", "last_name", "email", "phone"])
      .where("id", "=", scope.userUuid)
      .limit(1)
      .compile();
  }, [scope]);

  const { data } = useTypedQuery(compiled, expect<UserRow>());

  return useMemo(() => {
    const row = data?.[0];
    if (!row) return { identity: null };

    return {
      identity: {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
      },
    };
  }, [data]);
}

/**
 * Any user's display name, by id — for showing *who* did something the current
 * driver is looking at (today: who marked a damage report fixed).
 *
 * `Users` syncs whole to every phone, so this normally resolves offline. It
 * still returns `null` when it cannot — an id that is not on the device yet, or
 * a row with no name on it — and callers must render something sensible in that
 * case rather than printing an empty string.
 */
export function useUserDisplayName(
  userUuid: string | null | undefined,
): string | null {
  const compiled = useMemo(() => {
    if (!userUuid) return null;

    return db
      .selectFrom("Users")
      .select(["id", "first_name", "last_name"])
      .where("id", "=", userUuid)
      .limit(1)
      .compile();
  }, [userUuid]);

  const { data } = useTypedQuery(
    compiled,
    expect<Pick<UserRow, "id" | "first_name" | "last_name">>(),
  );

  return useMemo(() => {
    const row = data?.[0];
    if (!row) return null;

    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return name || null;
  }, [data]);
}
