import { db, photoUploadService } from "@/components/providers/SystemProvider";
import { localPhotoExists } from "@/library/photoUploadQueue";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type DriverDocUploadStatus =
  | "pending"
  | "uploaded"
  | "failed"
  | "unknown";

type DriverDocumentStatusRow = {
  photo_path: string | null;
  upload_status: string | null;
};

/** `uploading` shows as `pending`; a missing row (admin-uploaded) is `unknown`. */
function toStatus(raw: string | null): DriverDocUploadStatus {
  if (raw === "uploaded") return "uploaded";
  if (raw === "failed") return "failed";
  if (raw === "pending" || raw === "uploading") return "pending";
  return "unknown";
}

/**
 * Reactively reads the custom-queue `upload_status` for the given document
 * bucket paths from DriverDocuments. No row → "unknown" (admin-uploaded, or the
 * doc predates the queue).
 */
export function useDriverDocUploadStatuses(
  paths: (string | null | undefined)[],
) {
  const stableKey = paths.filter(Boolean).sort().join("|");
  const stablePaths = useMemo(
    () => [...new Set(paths.filter((p): p is string => Boolean(p)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  );

  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverDocuments")
        .select(["photo_path", "upload_status"])
        .where(
          "photo_path",
          "in",
          stablePaths.length > 0 ? stablePaths : ["__none__"],
        )
        .compile(),
    [stablePaths],
  );

  const { data } = useTypedQuery(compiled, expect<DriverDocumentStatusRow>());

  const statuses = useMemo(() => {
    const result: Record<string, DriverDocUploadStatus> = {};
    for (const path of stablePaths) {
      result[path] = "unknown";
    }
    for (const row of data) {
      if (row.photo_path) {
        result[row.photo_path] = toStatus(row.upload_status);
      }
    }
    return result;
  }, [data, stablePaths]);

  const hasPending = Object.values(statuses).some((s) => s === "pending");
  const hasFailed = Object.values(statuses).some((s) => s === "failed");

  const retryFailed = async (): Promise<{
    retried: number;
    needRepick: string[];
  }> => {
    let retried = 0;
    const needRepick: string[] = [];
    for (const [path, status] of Object.entries(statuses)) {
      if (status !== "failed") continue;
      if (!(await localPhotoExists(path))) {
        needRepick.push(path);
        continue;
      }
      await executeTypedMutationVoid(
        db
          .updateTable("DriverDocuments")
          .set({ upload_status: "pending" })
          .where("photo_path", "=", path)
          .compile(),
      );
      retried += 1;
    }
    if (retried > 0) {
      void photoUploadService?.triggerFast();
    }
    return { retried, needRepick };
  };

  return { statuses, hasPending, hasFailed, retryFailed };
}

/** unknown/uploaded → ready checkmark on Profile. */
export function isDocPathReady(
  status: DriverDocUploadStatus | undefined,
): boolean {
  return status === "uploaded" || status === "unknown" || status === undefined;
}
