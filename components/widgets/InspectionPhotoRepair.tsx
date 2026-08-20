import { PhotoRepairBanner } from "@/components/widgets/PhotoRepairBanner";
import { useInspectionPhotos } from "@/hooks/db/useInspection";
import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import { usePhotoRepair, type RepairablePhoto } from "@/hooks/usePhotoRepair";
import { isWorkTrackerClosed } from "@/utils/workTrackerStatus";
import React, { useMemo } from "react";

type Props = {
  inspectionUuid: string | null;
  /** `WorkTrackers.status` of the trip that owns the inspection. */
  tripStatus: string | null;
};

/**
 * Surfaces inspection photos the bucket confirmed never arrived, on the trip
 * card that owns them.
 *
 * Inspection photos are captured once, at submit, and never revisited — so
 * without this the driver has no place at all to notice, let alone fix, one
 * that was lost. Renders nothing unless the §6 verification pass has actually
 * confirmed a photo missing, which is also why it is safe to mount on every
 * trip card.
 *
 * Editing stops once the trip is closed (see `isWorkTrackerClosed`): a finished
 * trip's inspection is a record, not a draft.
 */
export function InspectionPhotoRepair({ inspectionUuid, tripStatus }: Props) {
  // This mounts on every trip card, so it must cost nothing in the normal case.
  // Replacement can only ever be offered for a row in the confirmed-missing set,
  // so while that set is empty there is no query worth running at all.
  const anythingConfirmedMissing = useConfirmedMissingPhotoIds().size > 0;
  const { Photos } = useInspectionPhotos(
    anythingConfirmedMissing ? inspectionUuid : null,
  );
  const editable = !isWorkTrackerClosed(tripStatus);

  const photos: RepairablePhoto[] = useMemo(
    () =>
      (Photos ?? []).map((photo) => ({
        id: photo.id,
        uploadStatus: photo.upload_status,
        lastError: photo.last_error,
        createdAt: photo.created_at,
        bucketPath: photo.storage_path,
      })),
    [Photos],
  );

  const repair = usePhotoRepair({
    parent: inspectionUuid
      ? { table: "InspectionPhotos", inspectionUuid }
      : null,
    photos,
    editable,
    subject: "inspection",
  });

  return (
    <PhotoRepairBanner
      repair={repair}
      subject="inspection"
      editable={editable}
    />
  );
}
