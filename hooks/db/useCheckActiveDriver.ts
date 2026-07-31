import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { UserData } from "./useWorkTrackers";

export type DriverCheck = {
  /** An active Drivers row exists in the local DB for this user. */
  driverActive: boolean;
  /** A Users row exists in the local DB for this Clerk user. */
  userRowExists: boolean;
  /** Clerk reports the user as signed in. */
  isSignedIn: boolean;
  /** Local reactive queries have not resolved yet. */
  queriesLoading: boolean;
};

/**
 * Resolves whether the signed-in Clerk user maps to an active driver, using
 * only the local DB. Exposes the intermediate facts (Users row present, active
 * Driver present, still loading) so callers can distinguish "still syncing",
 * "account not found" and "no driver profile". Combine with sync status in
 * useDriverGate to decide what to show.
 */
export function useCheckDriver(): DriverCheck {
  const { user, isSignedIn } = useUser();
  const clerkUserId = user?.id ?? null;

  // 1. Find the Users row for this Clerk user.
  const compiledUser = useMemo(() => {
    if (!clerkUserId || !isSignedIn) return null;
    return db
      .selectFrom("Users as u")
      .select(["u.id as id"])
      .where("clerk_user_id", "=", clerkUserId)
      .limit(1)
      .compile();
  }, [clerkUserId, isSignedIn]);

  const userQueryResult = useTypedQuery(compiledUser, expect<UserData>());
  const userRowExists = (userQueryResult.data?.length ?? 0) > 0;

  // 2. Find an active Driver linked to that Users row.
  const compiledDriver = useMemo(() => {
    if (!isSignedIn) return null;
    const userId = userQueryResult.data?.[0]?.id;
    if (!userId) return null;
    return db
      .selectFrom("Drivers")
      .select(["id", "user_uuid", "is_active"])
      .where("user_uuid", "=", userId)
      .limit(1)
      .compile();
  }, [userQueryResult.data, isSignedIn]);

  const driverQueryResult = useTypedQuery(
    compiledDriver,
    expect<{ id: string; user_uuid: string | null; is_active: number | null }>(),
  );

  const driverActive = driverQueryResult.data?.[0]?.is_active === 1;

  // The driver query only carries meaning once a Users row was found; when it
  // hasn't, it runs against an empty statement and its loading flag is noise.
  const queriesLoading =
    userQueryResult.isLoading ||
    (userRowExists && driverQueryResult.isLoading);

  return {
    driverActive,
    userRowExists,
    isSignedIn: isSignedIn === true,
    queriesLoading,
  };
}
