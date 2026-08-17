/**
 * §15 — who the queue is currently working for.
 *
 * The photo tables sync to every authenticated driver, not just their owner
 * (`DamageReports`/`DamageReportPhotos` RLS is `get_current_driver_id() IS NOT
 * NULL`), so a device routinely holds rows belonging to other drivers. Every
 * read in `tableAdapters.ts` therefore has to be scoped by the signed-in
 * driver, and it needs the two ids that scoping is expressed in.
 *
 * A plain module-level value rather than context or a hook, for the same reason
 * `recoveryStore.ts` is one: almost none of the queue runs inside React. Passes
 * are driven by a timer, an `AppState` transition or a network edge, and read
 * this synchronously from `tableAdapters.ts` — there is no render to read a
 * context during. `SystemProvider.tsx` is the only writer.
 *
 * `null` is a meaningful, safe value and the default: it means "no driver is
 * established right now", and every adapter method answers with its empty
 * result rather than falling back to an unscoped query. The window between two
 * drivers on one device is therefore "nobody", never "the previous driver".
 */

export type CurrentDriverContext = {
  /** `Users.id` — what `DamageReports.created_by_user_uuid` points at. */
  userUuid: string;
  /** `Drivers.id` — what `WorkTrackers.driver_uuid` points at. */
  driverUuid: string;
};

let context: CurrentDriverContext | null = null;

/**
 * Publishes the signed-in driver's ids, or `null` to withdraw them.
 *
 * Called only from `SystemProvider.tsx`, which resolves both ids reactively
 * from the local DB (Clerk user → `Users` → `Drivers`).
 */
export function setCurrentDriverContext(
  next: CurrentDriverContext | null,
): void {
  context = next;
}

/** The signed-in driver's ids, or `null` when none is established. */
export function getCurrentDriverContext(): CurrentDriverContext | null {
  return context;
}

/**
 * Withdraws the ids — sign-out, and the instant the Clerk user id changes.
 *
 * Deliberately eager: it is always correct for the queue to do nothing for a
 * moment, and never correct for it to act on the wrong driver's photos.
 */
export function clearCurrentDriverContext(): void {
  context = null;
}
