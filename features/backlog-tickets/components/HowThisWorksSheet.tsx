/**
 * What the "i" in the header opens.
 *
 * This sheet is carrying more than a help text: the driver is never shown a
 * status for their ticket (deliberately — a backlog item can sit for weeks, and
 * a "To Do" badge that never moves reads as being ignored, which is worse than
 * no badge at all). So this is the only place that sets the expectation
 * honestly: it is read, there is no reply here, and it is yours to fix or
 * withdraw for a day.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { DAILY_TICKET_LIMIT } from "@/features/backlog-tickets/utils/dailyTicketLimit";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Point = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const POINTS: Point[] = [
  {
    icon: "chatbubble-ellipses-outline",
    title: "It goes straight to the developers",
    body:
      "Whatever you write here lands on the developers' board, in your words. " +
      "No manager forwards it and nothing is rewritten on the way.",
  },
  {
    icon: "bug-outline",
    title: "What to write",
    body:
      "Anything about the app: something broken, something slower than it " +
      "should be, a step that takes too many taps, or an idea for what would " +
      "make your day easier. Say what you were doing and what happened.",
  },
  {
    icon: "create-outline",
    title: "You have 24 hours to change it",
    body:
      "For a day after you send a ticket you can reopen it, fix the wording, " +
      "or delete it. After that it stays as written — the team may already be " +
      "working from it.",
  },
  {
    icon: "time-outline",
    title: "You will not get a reply here",
    body:
      "There is no status or answer on this screen. Some tickets are picked up " +
      "the same week, others wait — that silence is not you being ignored.",
  },
  {
    icon: "layers-outline",
    title: `${DAILY_TICKET_LIMIT} tickets a day`,
    body:
      `You can send ${DAILY_TICKET_LIMIT} tickets per day. One clear ticket per ` +
      "problem is worth more than five quick ones.",
  },
];

export default function HowThisWorksSheet() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Direct Line to Developers</Text>

      {POINTS.map((point) => (
        <View key={point.title} style={styles.point}>
          <View style={styles.iconBubble}>
            <Ionicons name={point.icon} size={18} color={theme.accent} />
          </View>
          <View style={styles.pointText}>
            <Text style={styles.pointTitle}>{point.title}</Text>
            <Text style={styles.pointBody}>{point.body}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
    heading: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.header,
    },
    point: { flexDirection: "row", gap: 12 },
    iconBubble: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    pointText: { flex: 1, gap: 3 },
    pointTitle: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    pointBody: { ...typeScale.footnote, color: theme.textSecondary },
  });
