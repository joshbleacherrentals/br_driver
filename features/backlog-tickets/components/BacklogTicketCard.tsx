/**
 * One ticket in the list.
 *
 * No status badge, on purpose — see `HowThisWorksSheet`. What the card does
 * show is the one thing that is genuinely time-sensitive to the driver: how
 * much of the 24-hour window is left to change what they wrote.
 */

import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import type { BacklogTicketData } from "@/hooks/db/useBacklogTickets";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatEditWindowLeft } from "../utils/ticketEditWindow";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BacklogTicketCard({
  ticket,
  editWindowMsLeft,
  onPress,
}: {
  ticket: BacklogTicketData;
  editWindowMsLeft: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const countdown = formatEditWindowLeft(editWindowMsLeft);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.title} numberOfLines={2}>
        {ticket.title}
      </Text>

      {ticket.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {ticket.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.date}>{formatDate(ticket.created_at)}</Text>

        {countdown ? (
          <View style={styles.editablePill}>
            <Ionicons name="create-outline" size={12} color={theme.accent} />
            <Text style={styles.editableText}>Editable · {countdown}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 14,
      marginBottom: 10,
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "card"),
    },
    title: {
      ...typeScale.headline,
      fontWeight: "700",
      color: theme.header,
    },
    description: { ...typeScale.subhead, color: theme.textSecondary },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 2,
    },
    date: { ...typeScale.footnote, color: theme.textTertiary },
    editablePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: theme.accentSoft,
    },
    editableText: {
      ...typeScale.caption,
      fontWeight: "700",
      color: theme.accent,
    },
  });
