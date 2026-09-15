/**
 * Everything one bleacher's page shows, assembled from four local tables.
 *
 * The screen above takes an id and gets an asset; it never learns that the
 * type name came from one table, the yard from another and the inspection from
 * a third, nor which of them have reached this device yet.
 */

import { useBleacher } from "@/hooks/db/useBleacher";
import { useBleacherAnnualInspection } from "@/hooks/db/useBleacherAnnualInspection";
import { useBleacherTotalDistance } from "@/hooks/db/useBleacherTotalDistance";
import { useFleetReference } from "@/hooks/db/useFleetReference";
import { useMemo } from "react";

import {
  toAssetDetail,
  type BleacherAssetDetail,
} from "../utils/bleacherAssetView";

export function useAssetDetail(bleacherId: string | null): {
  asset: BleacherAssetDetail | null;
  totalDistanceMeters: number | null;
  /** The annual-inspection certificate in storage, if one was filed. */
  inspectionDocumentPath: string | null;
} {
  const { bleacher } = useBleacher(bleacherId);
  const lookups = useFleetReference();
  const inspection = useBleacherAnnualInspection(bleacherId);
  const totalDistanceMeters = useBleacherTotalDistance(bleacherId);

  const asset = useMemo(
    () => (bleacher ? toAssetDetail(bleacher, lookups, inspection) : null),
    [bleacher, lookups, inspection],
  );

  return {
    asset,
    totalDistanceMeters,
    inspectionDocumentPath: inspection?.document_path ?? null,
  };
}
