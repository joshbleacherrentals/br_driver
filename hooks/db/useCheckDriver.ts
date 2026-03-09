import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { UserData } from "./useWorkTrackers";

export function useCheckDriver(): { driverProfile: boolean | undefined; isLoading: boolean } {
  const { user, isSignedIn } = useUser();
  const clerkUserId = user?.id ?? null;

  const compiled = useMemo(() => {
    if (!clerkUserId || !isSignedIn) return null;
    return db
      .selectFrom("Users as u")
      .select(["u.id as id"])
      .where("clerk_user_id", "=", clerkUserId)
      .limit(1)
      .compile();
  }, [clerkUserId, isSignedIn]);

  const userQueryResult = useTypedQuery(compiled, expect<UserData>());

  const compiledDriver = useMemo(() => {
    if (!isSignedIn) return null;
    const userId = userQueryResult.data?.[0]?.id;
    if (!userId) return null;
    return db
      .selectFrom("Drivers")
      .select(["id", "user_uuid"])
      .where("user_uuid", "=", userId)
      .limit(1)
      .compile();
  }, [userQueryResult.data, isSignedIn]);

  const driverQueryResult = useTypedQuery(compiledDriver, expect<{ id: string; user_uuid: string | null }>());

  const isLoading = userQueryResult.isLoading || driverQueryResult.isLoading;

  if (!isSignedIn) return { driverProfile: undefined, isLoading: false };
  if (isLoading) return { driverProfile: undefined, isLoading: true };
  return {
    driverProfile: compiledDriver !== null && (driverQueryResult.data?.length ?? 0) > 0,
    isLoading: false,
  };
}