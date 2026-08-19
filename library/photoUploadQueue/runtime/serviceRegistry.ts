/**
 * The live photo upload service and §6 foreground-recovery instances.
 *
 * Both are created in `SystemProvider.tsx` — they need the authenticated
 * Supabase client from `BackendConnector`, and are recreated whenever it is —
 * but they are consumed from well outside React: `applyPhotoRepair.ts`,
 * `requeuePhotoRows.ts` and `replaceDriverDocumentPhoto.ts` kick the queue
 * after a write, and screens call `triggerFast()` after saving a photo.
 *
 * A plain module-level store rather than context or a hook, for the same reason
 * `library/powersync/scoping/driverScope.ts` is one: the callers are ordinary
 * async functions with no render to read a context during. It also breaks the
 * require cycle
 * those runtime modules used to form — they reached back into
 * `SystemProvider.tsx` for the mutable `photoUploadService` binding while
 * `SystemProvider.tsx` imported the queue's barrel. `SystemProvider.tsx` is
 * still the only writer; everyone else reads.
 *
 * `undefined` is the meaningful default: it means "no session has wired the
 * queue up yet". Every caller uses optional chaining on the result rather than
 * asserting — a trigger that arrives before the service exists is a no-op, not
 * a crash, and the next pass picks the row up from the local DB anyway.
 */

import type { ForegroundRecovery } from "./foregroundRecovery";
import type { PhotoUploadService } from "./photoUploadService";
import { photoQueueLog } from "./photoQueueLog";

let service: PhotoUploadService | undefined;
let recovery: ForegroundRecovery | undefined;

/**
 * How many services this process has installed. Dev-only, and deliberately so:
 * "exactly one install per session" is the invariant the whole dispose design
 * exists to protect, and it is otherwise invisible — an extra instance shows up
 * as memory and duplicate upload lanes, never as an error. One log line per
 * install makes a regression obvious in the Metro console during a normal
 * submit, at zero production cost.
 */
let installCount = 0;

/**
 * Publishes the upload service for this session, retiring the previous one.
 *
 * Called only from `SystemProvider.tsx`, which rebuilds it alongside the
 * Supabase client. Disposal happens *here* rather than at the call site because
 * the invariant — at most one service may be claiming rows at a time — has to
 * hold structurally: a caller that installs a replacement and forgets to retire
 * the old one leaves an immortal instance behind, and that is exactly the bug
 * this used to have. There is now one place the transition can happen, so there
 * is no way to do half of it.
 */
export function setPhotoUploadService(next: PhotoUploadService | undefined) {
  if (service && service !== next) {
    service.dispose();
  }
  service = next;

  if (__DEV__ && next) {
    installCount += 1;
    photoQueueLog.info(
      `service installed (#${installCount} this session) — a single submit ` +
        `must not raise this number`,
    );
  }
}

/** The live upload service, or `undefined` before one is established. */
export function getPhotoUploadService(): PhotoUploadService | undefined {
  return service;
}

/**
 * Publishes the §6 foreground-recovery instance for this session, retiring the
 * previous one.
 *
 * Same reasoning as `setPhotoUploadService` above: a superseded instance would
 * otherwise keep a verification timer alive against a stale Supabase client,
 * and whether it does is not something a caller should have to remember.
 */
export function setPhotoUploadRecovery(next: ForegroundRecovery | undefined) {
  if (recovery && recovery !== next) {
    recovery.dispose();
  }
  recovery = next;
}

/** The live recovery instance, or `undefined` before one is established. */
export function getPhotoUploadRecovery(): ForegroundRecovery | undefined {
  return recovery;
}
