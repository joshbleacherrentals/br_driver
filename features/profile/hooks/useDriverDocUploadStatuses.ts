import {
  photoAttachmentQueue,
  powerSyncDb,
} from "@/components/providers/SystemProvider";
import { DRIVER_DOC_ATTACHMENT_TABLE } from "@/library/powersync/AppSchema";
import { AttachmentState } from "@powersync/attachments";
import { useEffect, useMemo, useState } from "react";

export type DriverDocUploadStatus =
  | "pending"
  | "uploaded"
  | "failed"
  | "unknown";

type AttachmentRow = { id: string; state: number };

/**
 * Watches local driver_doc_attachments for the given storage paths.
 * No attachment row → "unknown" (admin-uploaded or cache-expired after sync).
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

  const [rows, setRows] = useState<AttachmentRow[]>([]);

  useEffect(() => {
    if (stablePaths.length === 0) {
      setRows([]);
      return;
    }

    const abortController = new AbortController();
    const placeholders = stablePaths.map(() => "?").join(",");
    const query = `SELECT id, state FROM ${DRIVER_DOC_ATTACHMENT_TABLE}
                   WHERE id IN (${placeholders})`;

    powerSyncDb.watch(
      query,
      stablePaths,
      {
        onResult: (result: { rows?: { _array?: AttachmentRow[] } }) => {
          setRows(result.rows?._array ?? []);
        },
      },
      { signal: abortController.signal },
    );

    return () => {
      abortController.abort();
    };
  }, [stablePaths]);

  const byPath = useMemo(() => {
    const map = new Map<string, DriverDocUploadStatus>();
    for (const path of stablePaths) {
      map.set(path, "unknown");
    }
    for (const row of rows) {
      if (
        row.state === AttachmentState.QUEUED_UPLOAD ||
        row.state === AttachmentState.QUEUED_SYNC ||
        row.state === AttachmentState.QUEUED_DOWNLOAD
      ) {
        map.set(row.id, "pending");
      } else if (row.state === AttachmentState.SYNCED) {
        map.set(row.id, "uploaded");
      } else if (row.state === AttachmentState.ARCHIVED) {
        map.set(row.id, "failed");
      }
    }
    return map;
  }, [rows, stablePaths]);

  const statuses = useMemo(() => {
    const result: Record<string, DriverDocUploadStatus> = {};
    for (const [path, status] of byPath) {
      result[path] = status;
    }
    return result;
  }, [byPath]);

  const hasPending = [...byPath.values()].some((s) => s === "pending");
  const hasFailed = [...byPath.values()].some((s) => s === "failed");

  const retryFailed = async (): Promise<{
    retried: number;
    needRepick: string[];
  }> => {
    if (!photoAttachmentQueue) {
      return { retried: 0, needRepick: [] };
    }
    let retried = 0;
    const needRepick: string[] = [];
    for (const [path, status] of byPath) {
      if (status !== "failed") continue;
      const ok = await photoAttachmentQueue.retryUpload(path);
      if (ok) retried += 1;
      else needRepick.push(path);
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
