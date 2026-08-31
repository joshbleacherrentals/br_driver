import BottomSheetModal from "@/components/ui/BottomSheetModal";
import { ThemeColors, radius, typeScale } from "@/constants/theme";
import {
  useWorkTrackerLineItems,
  type WorkTrackerLineItem,
} from "@/hooks/db/useWorkTrackerLineItems";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import {
  formatCents,
  lineItemLabel,
  lineItemTotalCents,
} from "@/utils/lineItems";
import { rollForQuack } from "@/utils/quack";
import { QuackButton } from "@/components/widgets/quackButton";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * The trip's pay, as a tappable pill that opens its line-item breakdown.
 *
 * The pay amount *is* the affordance — line items are the breakdown of
 * `WorkTrackers.pay_cents`, so the sheet hangs off the number it explains
 * rather than off a separate button competing with the BOL one. The pill
 * treatment (tinted fill, receipt glyph, chevron) is what makes it read as
 * tappable; plain text with a chevron does not.
 *
 * With no line items synced there is nothing to open, so it renders as the
 * static amount it was before — never a button that opens an empty sheet.
 */
export function PayAmount({
  workTrackerId,
  payCents,
  textStyle,
}: {
  workTrackerId: string;
  payCents: number | null;
  /** Caller's own pay typography, so each screen keeps its own scale. */
  textStyle?: object;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeChipStyles);
  const [visible, setVisible] = React.useState(false);
  const { lineItems, totalCents } = useWorkTrackerLineItems(workTrackerId);

  if (payCents === null && lineItems.length === 0) return null;

  const amount = formatCents(payCents ?? totalCents);

  if (lineItems.length === 0) {
    return <Text style={[styles.plainAmount, textStyle]}>{amount}</Text>;
  }

  return (
    <>
      <TouchableOpacity
        style={styles.chip}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${amount}. View pay breakdown`}
      >
        <Ionicons name="receipt-outline" size={14} color={theme.accent} />
        <Text style={[styles.chipAmount, textStyle, { color: theme.accent }]}>
          {amount}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.accent} />
      </TouchableOpacity>

      {visible && (
        <PayBreakdownSheet
          visible={visible}
          workTrackerId={workTrackerId}
          onClose={() => setVisible(false)}
        />
      )}
    </>
  );
}

/** The breakdown itself — one row per line item. */
export function PayBreakdownSheet({
  visible,
  workTrackerId,
  onClose,
}: {
  visible: boolean;
  workTrackerId: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeSheetStyles);
  const { lineItems } = useWorkTrackerLineItems(workTrackerId);

  // Rolled once per mount, and the sheet is mounted only while open — so the
  // odds are per sheet-open, and the duck never blinks in or out from under a
  // re-render while somebody is looking at it.
  const [hasDuck] = React.useState(rollForQuack);

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pay Breakdown</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {lineItems.length === 0 ? (
          <Text style={styles.emptyText}>
            No line items on this trip yet.
          </Text>
        ) : (
          lineItems.map((item, index) => (
            <LineItemRow
              key={item.id}
              item={item}
              isLast={index === lineItems.length - 1}
            />
          ))
        )}

        {hasDuck && <QuackButton />}
      </ScrollView>
    </BottomSheetModal>
  );
}

function LineItemRow({
  item,
  isLast,
}: {
  item: WorkTrackerLineItem;
  isLast: boolean;
}) {
  const styles = useThemedStyles(makeSheetStyles);
  const quantity = item.quantity ?? 0;

  // No rule under the last row: with the total gone it would be a separator
  // separating nothing.
  return (
    <View style={[styles.itemRow, isLast && styles.itemRowLast]}>
      <View style={styles.itemMain}>
        <Text style={styles.itemLabel}>{lineItemLabel(item.type)}</Text>
        <Text style={styles.itemMath}>
          {quantity} × {formatCents(item.unit_amt_cents)}
        </Text>
        {!!item.description?.trim() && (
          <Text style={styles.itemDescription}>{item.description.trim()}</Text>
        )}
      </View>
      <Text style={styles.itemTotal}>
        {formatCents(lineItemTotalCents(item))}
      </Text>
    </View>
  );
}

function makeChipStyles(theme: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      backgroundColor: theme.accentSoft,
      borderRadius: radius.pill,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    chipAmount: { ...typeScale.callout, fontWeight: "700" },
    plainAmount: {
      ...typeScale.callout,
      color: theme.textPrimary,
      fontWeight: "700",
    },
  });
}

function makeSheetStyles(theme: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    headerTitle: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    scrollContent: { padding: 20, paddingBottom: 40 },
    emptyText: {
      ...typeScale.subhead,
      color: theme.textSecondary,
      textAlign: "center",
      paddingVertical: 24,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    itemRowLast: { borderBottomWidth: 0 },
    itemMain: { flex: 1, gap: 2 },
    itemLabel: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    itemMath: { ...typeScale.footnote, color: theme.textSecondary },
    itemDescription: {
      ...typeScale.footnote,
      color: theme.textTertiary,
      marginTop: 2,
    },
    itemTotal: {
      ...typeScale.callout,
      fontWeight: "700",
      color: theme.textPrimary,
    },
  });
}
