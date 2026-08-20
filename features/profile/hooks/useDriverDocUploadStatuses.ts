import { db } from "@/components/providers/SystemProvider";
import {
  MISSING_LOCAL_FILE_ERROR,
  requeuePhotoRows,
} from "@/library/photoUploadQueue";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type DriverDocUploadStatus =
  | "pending"
  | "uploaded"
  | "failed"
  | "unknown";

type DriverDocumentStatusRow = {
  id: string;
  doc_type: string | null;
  photo_path: string | null;
  upload_status: string | null;
  last_error: string | null;
};

/** The queue row behind one document, as the profile UI needs it. */
export type DriverDocRow = {
  /** `DriverDocuments.id` — the key the §6 verification pass reports back. */
  id: string;
  docType: string | null;
  status: DriverDocUploadStatus;
  /** True when the local file is gone: only a new photo can fix the row. */
  fileMissing: boolean;
};

/** `uploading` shows as `pending`; a missing row (admin-uploaded) is `unknown`. */
function toStatus(raw: string | null): DriverDocUploadStatus {
  if (raw === "uploaded") return "uploaded";
  if (raw === "failed") return "failed";
  if (raw === "pending" || raw === "uploading") return "pending";
  return "unknown";
}

/**
 * Reactively reads the custom-queue state for the given document bucket paths
 * from DriverDocuments. No row → "unknown" (admin-uploaded, or the doc predates
 * the queue).
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
        .select(["id", "doc_type", "photo_path", "upload_status", "last_error"])
        .where(
          "photo_path",
          "in",
          stablePaths.length > 0 ? stablePaths : ["__none__"],
        )
        .compile(),
    [stablePaths],
  );

  const { data } = useTypedQuery(compiled, expect<DriverDocumentStatusRow>());

  const rows = useMemo(() => {
    const result: Record<string, DriverDocRow> = {};
    for (const row of data) {
      if (!row.photo_path) continue;
      result[row.photo_path] = {
        id: row.id,
        docType: row.doc_type,
        status: toStatus(row.upload_status),
        fileMissing: row.last_error === MISSING_LOCAL_FILE_ERROR,
      };
    }
    return result;
  }, [data]);

  const statuses = useMemo(() => {
    const result: Record<string, DriverDocUploadStatus> = {};
    for (const path of stablePaths) {
      result[path] = rows[path]?.status ?? "unknown";
    }
    return result;
  }, [rows, stablePaths]);

  const failedRows = useMemo(
    () =>
      stablePaths
        .map((path) => ({ path, row: rows[path] }))
        .filter((entry) => entry.row?.status === "failed"),
    [rows, stablePaths],
  );

  const hasPending = Object.values(statuses).some((s) => s === "pending");
  const hasFailed = failedRows.length > 0;
  /**
   * Retry is only worth offering while at least one failed document still has a
   * local file to send. Once every one is parked as file-missing, replacing the
   * photo is the only remaining fix.
   */
  const canRetry = failedRows.some((entry) => !entry.row?.fileMissing);

  const retryFailed = async (): Promise<{
    retried: number;
    needRepick: number;
  }> => {
    const { retried, needReAdd } = await requeuePhotoRows(
      "DriverDocuments",
      failedRows.map((entry) => ({
        id: entry.row!.id,
        bucketPath: entry.path,
      })),
    );
    return { retried, needRepick: needReAdd };
  };

  return { statuses, rows, hasPending, hasFailed, canRetry, retryFailed };
}

/** unknown/uploaded → ready checkmark on Profile. */
export function isDocPathReady(
  status: DriverDocUploadStatus | undefined,
): boolean {
  return status === "uploaded" || status === "unknown" || status === undefined;
}
