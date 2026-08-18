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

let service: PhotoUploadService | undefined;
let recovery: ForegroundRecovery | undefined;

/**
 * Publishes the upload service for this session.
 *
 * Called only from `SystemProvider.tsx`, which rebuilds it alongside the
 * Supabase client.
 */
export function setPhotoUploadService(next: PhotoUploadService | undefined) {
  service = next;
}

/** The live upload service, or `undefined` before one is established. */
export function getPhotoUploadService(): PhotoUploadService | undefined {
  return service;
}

/**
 * Publishes the §6 foreground-recovery instance for this session.
 *
 * Disposing the previous one is the caller's job — `SystemProvider.tsx` does it
 * before creating the replacement, so a superseded instance can't keep a
 * verification timer alive against a stale Supabase client.
 */
export function setPhotoUploadRecovery(next: ForegroundRecovery | undefined) {
  recovery = next;
}

/** The live recovery instance, or `undefined` before one is established. */
export function getPhotoUploadRecovery(): ForegroundRecovery | undefined {
  return recovery;
}
