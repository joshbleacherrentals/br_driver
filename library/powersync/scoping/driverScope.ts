/**
 * §15 — who the app is currently working for.
 *
 * The photo tables sync to every authenticated driver, not just their owner
 * (`DamageReports`/`DamageReportPhotos` RLS is `get_current_driver_id() IS NOT
 * NULL`), so a device routinely holds rows belonging to other drivers. Every
 * read on those tables therefore has to be scoped by the signed-in driver, and
 * it needs the two ids that scoping is expressed in.
 *
 * This used to live in `library/photoUploadQueue/runtime/currentDriverContext.ts`
 * and be owned by the upload queue. It is no longer the queue's private
 * concern: the same two ids scope the queue's adapters, the banner, and the
 * hooks the damage-report and inspection screens read through. Ownership
 * therefore moved down to `library/powersync/scoping/`, a leaf that knows only
 * `db` and `AppSchema`, and the queue became one of its consumers.
 *
 * A plain module-level store rather than context or a hook, for the same reason
 * `recoveryStore.ts` is one: almost none of the queue runs inside React. Passes
 * are driven by a timer, an `AppState` transition or a network edge, and read
 * this synchronously — there is no render to read a context during. React-side
 * callers get the same value reactively through `hooks/useDriverScope.ts`, which
 * is a `useSyncExternalStore` over the subscribe/get pair below.
 *
 * `null` is a meaningful, safe value and the default: it means "no driver is
 * established right now", and every scoped read answers with its empty result
 * rather than falling back to an unscoped query. The window between two drivers
 * on one device is therefore "nobody", never "the previous driver".
 */

declare const driverScopeBrand: unique symbol;

/**
 * The signed-in driver's two ids, as a *nominal* type.
 *
 * The brand is the point. Scoped queries take a `DriverScope`, not two strings,
 * so a route param, a `useLocalSearchParams()` value or any hand-rolled
 * `{ userUuid, driverUuid }` object cannot be passed where one is required —
 * only `publishDriverScope` below can mint one, and only `SystemProvider`'s
 * publisher calls it. "Scoped by whoever the caller says" is not expressible.
 */
export type DriverScope = {
  /** `Users.id` — what `DamageReports.created_by_user_uuid` points at. */
  readonly userUuid: string;
  /** `Drivers.id` — what `WorkTrackers.driver_uuid` points at. */
  readonly driverUuid: string;
  readonly [driverScopeBrand]: true;
};

let scope: DriverScope | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Publishes the signed-in driver's ids.
 *
 * Called only from `CurrentDriverScopePublisher.tsx`, which resolves both
 * reactively from the local DB (Clerk user → `Users` → `Drivers`).
 *
 * Idempotent *by value*: re-publishing the same two ids keeps the existing
 * object reference and notifies nobody. `useSyncExternalStore` compares
 * snapshots by identity, so minting a fresh object on every render of the
 * publisher would re-render every subscriber and recompile every query built
 * from the scope.
 */
export function publishDriverScope(userUuid: string, driverUuid: string): void {
  if (
    scope &&
    scope.userUuid === userUuid &&
    scope.driverUuid === driverUuid
  ) {
    return;
  }
  scope = { userUuid, driverUuid } as DriverScope;
  emit();
}

/**
 * Withdraws the ids — sign-out, and the instant the Clerk user id changes.
 *
 * Deliberately eager: it is always correct for the app to show and upload
 * nothing for a moment, and never correct for it to act on the wrong driver's
 * rows.
 */
export function clearDriverScope(): void {
  if (scope === null) return;
  scope = null;
  emit();
}

/**
 * The signed-in driver's scope, or `null` when none is established.
 *
 * Doubles as `useSyncExternalStore`'s snapshot half — the reference is stable
 * between real changes, which is what stops React re-rendering on every read.
 */
export function getDriverScope(): DriverScope | null {
  return scope;
}

/** `useSyncExternalStore` subscribe half (mirrors `recoveryStore.ts`). */
export function subscribeDriverScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
