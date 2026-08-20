import {
  getRecoveryState,
  subscribeRecoveryState,
} from "@/library/photoUploadQueue";
import { useSyncExternalStore } from "react";

/**
 * The §6 safety gate, as a hook.
 *
 * Photo row ids that the foreground recovery pass checked *directly against the
 * bucket* and found genuinely absent. This is the single signal any screen may
 * use to decide that a photo is really lost — the local `upload_status` alone is
 * ambiguous, because an upload can succeed server-side with only the
 * confirmation never reaching the phone.
 *
 * Every consumer reads the same published set rather than re-deriving one, so
 * the banner and the per-screen repair affordances can never disagree about
 * which photos are lost.
 */
export function useConfirmedMissingPhotoIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeRecoveryState,
    getRecoveryState,
    getRecoveryState,
  ).confirmedMissingPhotoIds;
}
