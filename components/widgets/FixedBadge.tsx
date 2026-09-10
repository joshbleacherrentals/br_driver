/**
 * "Fixed" — a driver's claim that the damage on a report is gone.
 *
 * Spec: docs/specs/driver-fixed-damage-reports.md
 *
 * Deliberately NOT the same thing as "Resolved", and coloured to stay distinct
 * from it: the report is still open, still on every driver's phone, and still
 * waiting for a manager. What changed is that someone says it no longer needs
 * a repair — which is a claim, not a closure.
 *
 * One component rather than three copies of `fixed_by_driver === 1`, because
 * the same fact is rendered in the reports list, in the inspection summary's
 * damage card, and in the shared report card the dedupe checklist uses.
 */

import Badge from "@/components/ui/Badge";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { StyleProp, ViewStyle } from "react-native";

export default function FixedBadge({
  fixedByDriver,
  style,
}: {
  /**
   * `DamageReports.fixed_by_driver`. NULL — a report created by an older
   * client that has not round-tripped through Postgres yet — means "not
   * marked", not "unknown".
   */
  fixedByDriver: number | null | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  if (fixedByDriver !== 1) return null;

  return (
    <Badge
      label="Fixed"
      color={theme.success}
      icon="construct-outline"
      style={style}
    />
  );
}
