/**
 * Direct Line to Developers — the driver's own backlog tickets.
 *
 * Shaped after the damage-report history screen (list + "+" in the corner)
 * because that is the pattern drivers already know for "things I filed". What
 * it deliberately does NOT borrow is a status column: a backlog item can sit
 * for weeks, and a badge that never moves reads as being ignored. The header's
 * "i" carries that expectation instead.
 */

import BottomSheetModal from "@/components/ui/BottomSheetModal";
import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useMyBacklogTickets } from "@/hooks/db/useBacklogTickets";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import BacklogTicketCard from "./components/BacklogTicketCard";
import HowThisWorksSheet from "./components/HowThisWorksSheet";
import { useNow } from "./hooks/useNow";
import {
  DAILY_TICKET_LIMIT,
  canCreateTicket,
  nextTicketSlotAt,
} from "./utils/dailyTicketLimit";
import { editWindowMsLeft } from "./utils/ticketEditWindow";

function formatSlotTime(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const isToday = new Date().toDateString() === date.toDateString();
  return isToday ? time : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

export default function BacklogTicketsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const navigation = useNavigation();
  const now = useNow();

  const { tickets, createdAts, isLoading } = useMyBacklogTickets();
  const [infoVisible, setInfoVisible] = useState(false);

  const hasSlot = useMemo(
    () => canCreateTicket(createdAts, now),
    [createdAts, now],
  );

  // The header belongs to the tab navigator, but the sheet it opens is this
  // screen's state — so the button is installed from here rather than declared
  // in the layout, and the state stays where it is used.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => setInfoVisible(true)}
          style={styles.infoButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="How this works"
        >
          <Ionicons
            name="information-circle-outline"
            size={26}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, styles.infoButton, theme.textPrimary]);

  const handleCreate = useCallback(() => {
    if (hasSlot) {
      router.push("/backlog-ticket");
      return;
    }

    // The limit is a product rule, not a failure — say when it lifts rather
    // than only that it was hit.
    const slotAt = nextTicketSlotAt(createdAts, now);
    Alert.alert(
      "That's your tickets for today",
      `You can send ${DAILY_TICKET_LIMIT} tickets per day. ` +
        (slotAt
          ? `You can send another one at ${formatSlotTime(slotAt)}.`
          : "Try again tomorrow.") +
        "\n\nIf something is urgent, call your account manager.",
    );
  }, [hasSlot, createdAts, now, router]);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={48}
            color={theme.textTertiary}
          />
          <Text style={styles.emptyTitle}>No tickets yet</Text>
          <Text style={styles.emptyText}>
            Something in the app broken, slow, or just annoying? Tap + and tell
            the developers directly.
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={tickets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BacklogTicketCard
              ticket={item}
              editWindowMsLeft={editWindowMsLeft(item.created_at, now)}
              onPress={() =>
                router.push({
                  pathname: "/backlog-ticket",
                  params: { ticketId: item.id },
                })
              }
            />
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, !hasSlot && styles.fabExhausted]}
        activeOpacity={0.8}
        onPress={handleCreate}
        accessibilityRole="button"
        accessibilityLabel="New ticket"
      >
        <Ionicons name="add" size={28} color={theme.onAccent} />
      </TouchableOpacity>

      <BottomSheetModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
      >
        <HowThisWorksSheet />
      </BottomSheetModal>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    infoButton: { marginLeft: 16 },
    listContent: { padding: 16, paddingBottom: 100 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyTitle: {
      ...typeScale.headline,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    emptyText: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      textAlign: "center",
    },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 28,
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      ...elevation(theme, "floating"),
    },
    // Still tappable when the daily limit is spent — it explains itself rather
    // than going dead and leaving the driver to guess.
    fabExhausted: { opacity: 0.45 },
  });
