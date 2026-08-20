import { DebugLogger } from "@/library/debug/DebugLogger";
import { PHOTO_QUEUE_LOG_TAG } from "@/library/photoUploadQueue";
import { db } from "@/library/powersync/db";
import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useMemo } from "react";

/** Row shapes for the §15 Clerk → `Users` → `Drivers` lookup below. */
type UserIdRow = { id: string };
type DriverIdRow = { id: string };

/**
 * §15 — the app's single resolver for "who is this device working for".
 *
 * `DamageReports`/`DamageReportPhotos`/`InspectionPhotos` sync to every
 * authenticated driver, so every read of them has to be filtered by owner. The
 * two ids that filter is expressed in are resolved here, once, from the local
 * DB (Clerk user → `Users.id` → `Drivers.id`) and published to
 * `library/powersync/scoping`'s module store. Everything else — the upload
 * queue's table adapters, the banner, and the `hooks/db` reads behind the
 * damage-report and inspection screens — takes them from there rather than
 * running the same chain again, so there is exactly one place the answer can
 * come from and one moment it can change.
 *
 * A module store rather than React context because most consumers are not
 * React: the queue's passes are driven by a timer, an `AppState` transition or
 * a network edge. React-side consumers subscribe through `useDriverScope()`.
 *
 * This must be rendered as a *child* of `PowerSyncContext.Provider`, and that
 * placement is the entire reason it is a separate component. `useTypedQuery` →
 * `useQuery` → `usePowerSync()` is a plain `useContext(PowerSyncContext)`, and
 * `useContext` resolves by walking *up* from the calling component — a
 * component never sees a provider that lives inside its own returned element
 * tree. Run from `SystemProvider`'s body (where this block used to live) both
 * lookups therefore read the context default, `null`, and `@powersync/react`'s
 * `useQuery` answers a null database with a silent
 * `{ data: [], isLoading: false, error: Error('PowerSync not configured.') }` —
 * no throw, no warning. `userUuid`/`driverUuid` stayed `null` for the whole
 * session, nothing was ever published, and every scoped read short-circuited to
 * its empty result: total photo-upload blockage, invisible in the logs. As a
 * child of the provider the same hooks resolve normally.
 */
export function CurrentDriverScopePublisher() {
  const { isSignedIn, userId: clerkUserId } = useAuth();

  const compiledUserId = useMemo(() => {
    if (!clerkUserId) return null;
    return db
      .selectFrom("Users as u")
      .select(["u.id as id"])
      .where("clerk_user_id", "=", clerkUserId)
      .limit(1)
      .compile();
  }, [clerkUserId]);

  const userLookup = useTypedQuery(compiledUserId, expect<UserIdRow>());
  const userUuid = userLookup.data?.[0]?.id ?? null;

  const compiledDriverId = useMemo(() => {
    if (!userUuid) return null;
    return db
      .selectFrom("Drivers as d")
      .select(["d.id as id"])
      .where("user_uuid", "=", userUuid)
      .limit(1)
      .compile();
  }, [userUuid]);

  const driverLookup = useTypedQuery(compiledDriverId, expect<DriverIdRow>());
  const driverUuid = driverLookup.data?.[0]?.id ?? null;

  // Declared BEFORE the effect that publishes a scope, and keyed on the Clerk
  // id alone, so the two can never race: React runs effects in declaration
  // order, and on the commit where the Clerk id changes the id lookups above
  // still hold the *previous* driver's values. Clearing here means the window
  // between two drivers on one device is always "nobody", never "the driver
  // before".
  useEffect(() => {
    clearDriverScope();
  }, [clerkUserId]);

  // Both ids or nothing (§15, "scoping requires both ids"): a signed-in user
  // with a `Users` row but no `Drivers` row gets the same empty scope as
  // "nobody signed in", because the upload queue is gated on the same scope and
  // would never pick their photos up either.
  useEffect(() => {
    if (!isSignedIn || !userUuid || !driverUuid) {
      clearDriverScope();
      return;
    }
    publishDriverScope(userUuid, driverUuid);
  }, [isSignedIn, userUuid, driverUuid]);

  // Either lookup erroring is not survivable in silence. Without both ids every
  // scoped read short-circuits and the queue uploads nothing at all — which is
  // indistinguishable, from the outside, from "this driver has no photos". The
  // bug this component was extracted to fix produced exactly that error on both
  // lookups and reported it nowhere; from here on it is one grep away.
  //
  // Two things keep it from crying wolf. First, `isDisabled`: both lookups are
  // guarded (`compiledUserId` is null until Clerk resolves, `compiledDriverId`
  // until `Users.id` does), and a guarded lookup runs the no-op placeholder
  // query rather than the caller's — whatever it reports is not this component's
  // answer, so it is not this component's error. Second, the dependencies are
  // the error *messages*, not the `Error` objects: `useQuery` hands back a fresh
  // instance on re-render, and keying on identity re-logged one unchanging
  // failure on every unrelated render.
  const userError = userLookup.isDisabled
    ? null
    : (userLookup.error?.message ?? null);
  const driverError = driverLookup.isDisabled
    ? null
    : (driverLookup.error?.message ?? null);
  useEffect(() => {
    if (!userError && !driverError) return;
    DebugLogger.error(
      PHOTO_QUEUE_LOG_TAG,
      "§15 driver-scope lookup failed — reads stay empty and the queue will " +
        "upload nothing until this resolves",
      { userError, driverError },
    );
  }, [userError, driverError]);

  return null;
}

export default CurrentDriverScopePublisher;
