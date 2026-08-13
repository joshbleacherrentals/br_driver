import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import {
  applyPhotoRepair,
  derivePhotoRepairActions,
  minimumPicksToKeepOnePhoto,
  planPhotoReplacement,
  requeuePhotoRows,
  type RepairParent,
  type RepairPhotoRow,
  type RepairRowRef,
} from "@/library/photoUploadQueue";
import { promptForPhotos } from "@/utils/pickPhotos";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";

/** A photo row plus the bucket path the repair needs to write its file under. */
export type RepairablePhoto = RepairPhotoRow & { bucketPath: string | null };

export type PhotoRepairController = {
  /** Show the plain Retry button — something still has a local file to send. */
  canRetry: boolean;
  /** Show the "Choose Photos" button — bucket-confirmed lost, parent editable. */
  canReplace: boolean;
  /** How many photos are bucket-confirmed lost. */
  replaceableCount: number;
  isBusy: boolean;
  retry: () => Promise<void>;
  replace: () => Promise<void>;
};

const IDLE: PhotoRepairController = {
  canRetry: false,
  canReplace: false,
  replaceableCount: 0,
  isBusy: false,
  retry: async () => {},
  replace: async () => {},
};

function confirm(title: string, message: string, confirmLabel: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Drives the "some of these photos never reached the server" repair flow for one
 * damage report or inspection.
 *
 * Replacement is gated on `useConfirmedMissingPhotoIds` — the set the §6
 * recovery pass built from *direct bucket lookups*. Nothing here ever decides a
 * photo is lost from local state, because a `failed` row may well have uploaded
 * successfully with only the confirmation lost on the way back; overwriting such
 * a row would destroy a photo that did arrive.
 *
 * `editable` is the caller's edit boundary (a resolved report, a closed trip).
 * It stops replacement, which edits the record, but never Retry, which only
 * finishes delivering what the driver already submitted.
 */
export function usePhotoRepair(input: {
  parent: RepairParent | null;
  /** Every photo on the parent — repairable or not; the floor is counted here. */
  photos: readonly RepairablePhoto[];
  editable: boolean;
  /** Noun used in the dialogs, e.g. "report" or "inspection". */
  subject: string;
}): PhotoRepairController {
  const { parent, photos, editable, subject } = input;
  const confirmedMissingPhotoIds = useConfirmedMissingPhotoIds();
  const [isBusy, setIsBusy] = useState(false);

  const actions = useMemo(
    () =>
      derivePhotoRepairActions(photos, confirmedMissingPhotoIds, { editable }),
    [photos, confirmedMissingPhotoIds, editable],
  );

  const retry = useCallback(async () => {
    if (!parent) return;
    const targets = photos
      .filter((photo) => photo.uploadStatus !== "uploaded")
      .map((photo) => ({ id: photo.id, bucketPath: photo.bucketPath }));
    if (targets.length === 0) return;

    setIsBusy(true);
    try {
      const { retried, needReAdd } = await requeuePhotoRows(
        parent.table,
        targets,
      );
      if (needReAdd > 0 && retried === 0) {
        Alert.alert(
          "Nothing left to retry",
          `The original ${needReAdd === 1 ? "file is" : "files are"} no longer on this phone. Use "Choose Photos" to supply ${needReAdd === 1 ? "a replacement" : "replacements"}.`,
        );
      }
    } catch (err) {
      Alert.alert(
        "Retry failed",
        err instanceof Error ? err.message : "Could not retry the upload.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [parent, photos]);

  const replace = useCallback(async () => {
    if (!parent || !actions.canReplace) return;

    const replaceableRows = actions.replaceableRows;
    const replaceableCount = replaceableRows.length;
    const existingPhotoCount = photos.length;
    const minimumPicks = minimumPicksToKeepOnePhoto({
      replaceableCount,
      existingPhotoCount,
    });

    const picked = await promptForPhotos({
      title: `Replace ${plural(replaceableCount, "photo")}`,
      message:
        `${replaceableCount === 1 ? "This photo" : "These photos"} never reached the server and cannot be recovered from this phone. ` +
        `Pick ${plural(replaceableCount, "photo")} to replace ${replaceableCount === 1 ? "it" : "them"}. ` +
        `Extra photos are added to the ${subject}` +
        (minimumPicks > 0
          ? `, and you must pick at least one — a ${subject} cannot be left with no photos.`
          : "."),
    });

    // An empty result is a cancel: the picker cannot distinguish "chose nothing"
    // from "backed out", and treating it as a delete-everything instruction
    // would destroy photos on an accidental dismiss.
    if (picked.length === 0) return;

    const plan = planPhotoReplacement({
      replaceableRows,
      pickedCount: picked.length,
      existingPhotoCount,
    });

    if (plan.violatesMinimum) {
      Alert.alert(
        "Keep at least one photo",
        `That would leave this ${subject} with no photos. Pick at least ${plural(minimumPicks || 1, "photo")}.`,
      );
      return;
    }

    if (plan.deletions.length > 0) {
      const approved = await confirm(
        `Remove ${plural(plan.deletions.length, "photo")}?`,
        `You picked ${plural(picked.length, "photo")} for ${plural(replaceableCount, "missing photo")}. ` +
          `The remaining ${plural(plan.deletions.length, "photo")} will be removed from this ${subject}. This cannot be undone.`,
        "Remove",
      );
      if (!approved) return;
    }

    const rowsById = new Map<string, RepairRowRef>();
    for (const photo of photos) {
      if (photo.bucketPath) {
        rowsById.set(photo.id, { id: photo.id, bucketPath: photo.bucketPath });
      }
    }

    setIsBusy(true);
    try {
      const result = await applyPhotoRepair({
        parent,
        plan,
        rowsById,
        picked,
      });
      Alert.alert(
        "Photos updated",
        `${plural(result.replaced + result.added, "photo")} queued for upload. Keep the app open until it finishes.`,
      );
    } catch (err) {
      Alert.alert(
        "Could not update photos",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [parent, actions, photos, subject]);

  return useMemo(
    () =>
      parent
        ? {
            canRetry: actions.canRetry,
            canReplace: actions.canReplace,
            replaceableCount: actions.replaceableRows.length,
            isBusy,
            retry,
            replace,
          }
        : IDLE,
    [parent, actions, isBusy, retry, replace],
  );
}
