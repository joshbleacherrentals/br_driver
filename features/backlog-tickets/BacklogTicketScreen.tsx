/**
 * One backlog ticket: written, read, and — for 24 hours — corrected.
 *
 * A standalone stack screen rather than a modal for the same reason the damage
 * report is one: a driver types a paragraph here, with the keyboard up, and the
 * swipe-back gesture of a card screen is the affordance they already have.
 *
 * The three modes share one layout on purpose. Tapping Edit must not re-flow
 * the screen — the same words stay in the same place, and only the fields and
 * the button pair change.
 */

import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import {
  useBacklogTicket,
  useMyBacklogTickets,
} from "@/hooks/db/useBacklogTickets";
import { useDriverScope } from "@/hooks/useDriverScope";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { usePreventRemove } from "@react-navigation/native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BacklogTicketForm from "./components/BacklogTicketForm";
import KeyboardToolbar from "./components/KeyboardToolbar";
import TicketActionBar, {
  ACTION_BAR_CLEARANCE,
} from "./components/TicketActionBar";
import { useNow } from "./hooks/useNow";
import { createBacklogTicket } from "./utils/createBacklogTicket";
import { deleteBacklogTicket } from "./utils/deleteBacklogTicket";
import { hasUnsavedChanges } from "./utils/hasUnsavedChanges";
import {
  canEditTicket,
  editWindowMsLeft,
  formatEditWindowLeft,
} from "./utils/ticketEditWindow";
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from "./utils/ticketText";
import { updateBacklogTicket } from "./utils/updateBacklogTicket";

/**
 * Every way a write can be refused, in words a driver can act on.
 *
 * Kept exhaustive rather than falling back to a generic message: a refusal the
 * app cannot name is a refusal the driver cannot work around.
 */
const REFUSALS: Record<string, { title: string; body: string }> = {
  empty_title: {
    title: "Add a title",
    body: "One line naming what this is about.",
  },
  empty_description: {
    title: "Add a description",
    body: "Say what you were doing and what happened — that is what makes it fixable.",
  },
  title_too_long: {
    title: "Title is too long",
    body: `Keep the title under ${TITLE_MAX_LENGTH} characters and put the detail in the description.`,
  },
  description_too_long: {
    title: "Description is too long",
    body: `Descriptions can be up to ${DESCRIPTION_MAX_LENGTH} characters.`,
  },
  limit_reached: {
    title: "That's your tickets for today",
    body: "You have reached the daily limit. Try again tomorrow.",
  },
  edit_window_closed: {
    title: "This ticket can no longer be changed",
    body: "Tickets can be edited for 24 hours after they are sent. The team may already be working from this one.",
  },
};

function reportRefusal(reason: string): void {
  const refusal = REFUSALS[reason];
  if (!refusal) return;
  Alert.alert(refusal.title, refusal.body);
}

/** Matches the damage report's floating header, so the two screens agree. */
const FLOATING_HEADER_HEIGHT = 52;
const FLOATING_HEADER_GAP = 12;

function formatSentAt(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The one place leaving-with-unsaved-work is confirmed.
 *
 * Wording differs by what is actually at stake — a ticket that was never sent
 * versus edits to one that exists — because "Discard changes?" over a ticket
 * the driver believes they already sent is genuinely ambiguous.
 */
function confirmDiscard(mode: Mode, onDiscard: () => void): void {
  const isNewTicket = mode === "create";

  Alert.alert(
    isNewTicket ? "Discard this ticket?" : "Discard your changes?",
    isNewTicket
      ? "It has not been sent yet. What you have written will be lost."
      : "Your edits have not been saved. The ticket will stay as it was.",
    [
      { text: isNewTicket ? "Keep writing" : "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onDiscard },
    ],
  );
}

type Mode = "create" | "view" | "edit";

export default function BacklogTicketScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow();
  const scope = useDriverScope();

  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const isNew = !ticketId;

  const {
    ticket,
    isLoading: ticketLoading,
    isDisabled: ticketDisabled,
  } = useBacklogTicket(ticketId ?? null);
  const {
    createdAts,
    isLoading: ticketsLoading,
    isDisabled: ticketsDisabled,
  } = useMyBacklogTickets();

  /**
   * The local database has not answered yet — which is the state EVERY open of
   * an existing ticket starts in, PowerSync's `useQuery` returning
   * `{ data: [], isLoading: true }` on the first render. Treated as "not found"
   * it produced a flash of "no longer available" on every open, and a header
   * whose Edit and delete controls appeared a beat later, once `created_at`
   * arrived and the 24-hour window could finally be computed.
   *
   * `isDisabled` belongs in the same bucket rather than beside `!ticket`: it
   * means no query was ever built (no driver scope yet), and a disabled query
   * answers `[]` forever — so reading it as "not found" would state, wrongly
   * and permanently, that the driver's own ticket does not exist.
   */
  const resolving = !isNew && (ticketLoading || ticketDisabled);

  /**
   * Same reasoning on the create path, different stake. An unanswered list is
   * `[]`, and `[]` is a clean daily allowance — so Send would build a fourth
   * ticket, Postgres would refuse it, and PowerSync would drop it without
   * telling anyone. Send waits for a real count.
   */
  const countPending = ticketsLoading || ticketsDisabled;

  const [mode, setMode] = useState<Mode>(isNew ? "create" : "view");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * Set the moment a write succeeds, to stand the unsaved-changes guard down
   * before leaving.
   *
   * The fields still hold the text that was just saved, so the guard would
   * otherwise ask a driver who has already tapped Send whether they want to
   * discard it. Flipping state and closing in the same tick would not help —
   * the guard reads the value from the render that is already on screen — so
   * the departure waits for the effect below.
   */
  const [leaving, setLeaving] = useState(false);
  const navigation = useNavigation();

  // The row arrives from the local database, which can answer after first
  // paint. Seeding on every change would fight the driver's typing, so the
  // fields follow the row only while they are not being edited.
  useEffect(() => {
    if (!ticket || mode === "edit") return;
    setTitle(ticket.title ?? "");
    setDescription(ticket.description ?? "");
  }, [ticket, mode]);

  const createdAt = ticket?.created_at ?? null;
  const withinWindow = isNew || canEditTicket(createdAt, now);
  const countdown = isNew
    ? null
    : formatEditWindowLeft(editWindowMsLeft(createdAt, now));

  // An open edit whose window closes underneath the driver: drop back to view
  // rather than leaving a Save that the server would refuse and PowerSync would
  // drop without a word.
  useEffect(() => {
    if (mode === "edit" && !withinWindow) {
      setMode("view");
      reportRefusal("edit_window_closed");
    }
  }, [mode, withinWindow]);

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(drawer)/(tabs)/backlog-tickets");
  }, [router]);

  const savedDraft = useMemo(
    () =>
      ticket
        ? {
            title: ticket.title ?? "",
            description: ticket.description ?? "",
          }
        : null,
    [ticket],
  );

  const dirty = hasUnsavedChanges(mode, { title, description }, savedDraft);

  /**
   * The back-swipe is switched off entirely while a ticket is being written or
   * edited, rather than being allowed to ask.
   *
   * It is a full-screen edge gesture on a screen that is mostly a scroll view
   * with a multiline field in it, so an ordinary drag through the content —
   * scrolling, or moving the cursor — kept registering as "leave", and the
   * confirmation that followed was noise about work the driver had no
   * intention of abandoning. A gesture that has to be apologised for is worse
   * than one that is not offered: in these two modes the way out is the back
   * chevron and Cancel, both of which ask properly. Reading a ticket restores
   * the gesture, where there is nothing to lose by it.
   */
  const gestureAllowed = mode === "view";

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: gestureAllowed,
      fullScreenGestureEnabled: gestureAllowed,
    });
  }, [navigation, gestureAllowed]);

  /**
   * What is left after the gesture is gone: Android's hardware back, and any
   * navigation action dispatched at this screen. A guard attached to one
   * button is a guard those walk straight past.
   */
  usePreventRemove(dirty && !leaving, ({ data }) => {
    confirmDiscard(mode, () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaving) close();
  }, [leaving, close]);

  const isBlank = !title.trim() || !description.trim();

  const isUnchanged =
    mode === "edit" &&
    title.trim() === (ticket?.title ?? "").trim() &&
    description.trim() === (ticket?.description ?? "").trim();

  const handleSend = useCallback(async () => {
    if (!scope || busy) return;
    setBusy(true);
    try {
      const result = await createBacklogTicket({
        title,
        description,
        scope,
        recentCreatedAts: createdAts,
        now: Date.now(),
      });

      if (!result.ok) {
        reportRefusal(result.reason);
        return;
      }
      setLeaving(true);
    } finally {
      setBusy(false);
    }
  }, [scope, busy, title, description, createdAts]);

  const handleSave = useCallback(async () => {
    if (!scope || !ticketId || busy) return;
    setBusy(true);
    try {
      const result = await updateBacklogTicket({
        id: ticketId,
        title,
        description,
        scope,
        createdAt,
        now: Date.now(),
      });

      if (!result.ok) {
        reportRefusal(result.reason);
        return;
      }
      setMode("view");
    } finally {
      setBusy(false);
    }
  }, [scope, ticketId, busy, title, description, createdAt]);

  const revertEdit = useCallback(() => {
    setTitle(savedDraft?.title ?? "");
    setDescription(savedDraft?.description ?? "");
    setMode("view");
  }, [savedDraft]);

  const handleCancelEdit = useCallback(() => {
    // Cancel does not leave the screen, so `usePreventRemove` never sees it —
    // it asks for itself.
    if (!dirty) {
      revertEdit();
      return;
    }
    confirmDiscard("edit", revertEdit);
  }, [dirty, revertEdit]);

  const handleDelete = useCallback(() => {
    if (!scope || !ticketId) return;

    Alert.alert(
      "Delete this ticket?",
      "This cannot be undone, and it does not give you back today's ticket.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await deleteBacklogTicket({
              id: ticketId,
              scope,
              createdAt,
              now: Date.now(),
            });

            if (!result.ok) {
              reportRefusal(result.reason);
              return;
            }
            close();
          },
        },
      ],
    );
  }, [scope, ticketId, createdAt, close]);

  const actions = useMemo(() => {
    if (mode === "create") {
      return {
        primary: {
          label: "Send",
          onPress: handleSend,
          disabled: isBlank || !scope || countPending,
          busy,
        },
      };
    }

    if (mode === "edit") {
      return {
        secondary: {
          label: "Cancel",
          onPress: handleCancelEdit,
          disabled: busy,
        },
        primary: {
          label: "Save",
          onPress: handleSave,
          disabled: isBlank || isUnchanged,
          busy,
        },
      };
    }

    return {
      secondary: { label: "Close", onPress: close },
      // Edit disappears entirely once the window has closed — a disabled button
      // would only invite the tap that has to be explained afterwards.
      primary: withinWindow
        ? { label: "Edit", onPress: () => setMode("edit") }
        : undefined,
    };
  }, [
    mode,
    countPending,
    handleSend,
    handleSave,
    handleCancelEdit,
    close,
    isBlank,
    isUnchanged,
    withinWindow,
    busy,
    scope,
  ]);

  const headerTitle =
    mode === "create"
      ? "New Ticket"
      : mode === "edit"
        ? "Edit Ticket"
        : "Ticket";

  const missing = !isNew && !resolving && !ticket;
  const canDelete = mode === "view" && withinWindow && !resolving;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop:
              insets.top + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP * 2,
            paddingBottom: ACTION_BAR_CLEARANCE + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        // Swiping down over the content dismisses the keyboard — the gesture
        // drivers reach for first, and the only one that works with a thumb
        // while the keyboard covers the page.
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        // Keeps the focused field above the keyboard without a
        // KeyboardAvoidingView squeezing the whole layout.
        automaticallyAdjustKeyboardInsets
      >
        {resolving ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : missing ? (
          <Text style={styles.missing}>
            This ticket is no longer available.
          </Text>
        ) : (
          <>
            {mode === "create" ? (
              <View style={styles.lede}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={theme.accent}
                />
                <Text style={styles.ledeText}>
                  This goes straight to the developers, in your words.
                </Text>
              </View>
            ) : null}

            <BacklogTicketForm
              title={title}
              description={description}
              editable={mode !== "view"}
              onChangeTitle={setTitle}
              onChangeDescription={setDescription}
            />

            {mode === "view" ? (
              <View style={styles.metaCard}>
                <Text style={styles.metaText}>
                  Sent {formatSentAt(createdAt)}
                </Text>
                {countdown ? (
                  <View style={styles.editablePill}>
                    <Ionicons
                      name="create-outline"
                      size={12}
                      color={theme.accent}
                    />
                    <Text style={styles.editableText}>
                      Editable · {countdown}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.metaText}>
                    The 24-hour window has closed.
                  </Text>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Floating header, over the content — the damage report's language. */}
      <View
        style={[
          styles.headerOverlay,
          { paddingTop: insets.top + FLOATING_HEADER_GAP },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.floatingHeader}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={mode === "edit" ? handleCancelEdit : close}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.accent} />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>

          {canDelete ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleDelete}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Delete ticket"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>
      </View>

      {resolving || missing ? (
        <TicketActionBar secondary={{ label: "Close", onPress: close }} />
      ) : (
        <TicketActionBar {...actions} />
      )}

      <KeyboardToolbar />
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      backgroundColor: "transparent",
      zIndex: 10,
    },
    floatingHeader: {
      flexDirection: "row",
      alignItems: "center",
      height: FLOATING_HEADER_HEIGHT,
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      paddingHorizontal: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "floating"),
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
    },
    headerSide: { width: 40 },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      ...typeScale.body,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    scrollContent: { paddingHorizontal: 16 },
    lede: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.accentSoft,
      borderRadius: radius.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 16,
    },
    ledeText: { ...typeScale.subhead, color: theme.accent, flex: 1 },
    metaCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 4,
    },
    metaText: { ...typeScale.footnote, color: theme.textTertiary },
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
    centered: { alignItems: "center", justifyContent: "center", marginTop: 60 },
    missing: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      textAlign: "center",
      marginTop: 40,
    },
  });
