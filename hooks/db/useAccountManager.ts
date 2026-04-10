import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";


export type AccountManagerData = {
    id: string;
    created_at: string | null;
    is_active: number | null;
    user_uuid: string | null;
};

export type UserContactData = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
}

/**
 * Fetch AccountManagerData belonging to the user_id
 */
export function useAccountManager( am_uuid : string | null): { accountManager: UserContactData| null } {
  // 1. Get user_id from Users table
  const compiled = useMemo(() => {
    if (!am_uuid) return null;

    return db
      .selectFrom("AccountManagers")
      .select([
        "id",
        "created_at",
        "is_active",
        "user_uuid"
      ])
      .where("id", "=", am_uuid)
      .limit(1)
      .compile();
  }, [am_uuid]);

  const AccountManagerData = useTypedQuery(compiled, expect<AccountManagerData>());

  const compiledAM = useMemo(() => {
    const userId = AccountManagerData.data?.[0]?.user_uuid;
    if (!userId) return null;

    return db
    .selectFrom("Users")
    .select([
        "id",
        "first_name",
        "last_name",
        "email",
        "phone"
    ])
    .where("id", "=", userId)
    .limit(1)
    .compile();
  }, [AccountManagerData.data]);

  const AMData = useTypedQuery(compiledAM, expect<UserContactData>());

  return { accountManager: AMData.data?.[0] ?? null };
}