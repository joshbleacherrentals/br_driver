/**
 * The two fields a ticket is made of, in both of their states.
 *
 * Laid out as the damage report's cards — a titled surface per field on the
 * page background — so the two screens a driver files things from look like one
 * app. Same reason the REQUIRED badge is the damage report's badge: a driver
 * who has learned what red-REQUIRED means there should not have to learn it
 * again here.
 *
 * One component rather than a form and a separate read-only view: tapping Edit
 * should not re-flow the screen. The same words stay in the same place, and
 * only the fields become writable.
 *
 * The character counters appear as the driver approaches the cap instead of
 * sitting there permanently — a counter on an empty field reads as a demand.
 */

import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { KEYBOARD_ACCESSORY_ID } from "./KeyboardToolbar";
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "../utils/ticketText";

/** Counters stay hidden until the driver is within this much of the cap. */
const COUNTER_VISIBLE_WITHIN = 0.8;

function SectionHeader({
  title,
  value,
  max,
  editable,
}: {
  title: string;
  value: string;
  max: number;
  editable: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const nearCap = value.length >= max * COUNTER_VISIBLE_WITHIN;
  const showRequired = editable && !value.trim();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {showRequired ? (
        <View style={styles.requiredBadge}>
          <Text style={styles.requiredText}>REQUIRED</Text>
        </View>
      ) : null}

      {editable && nearCap ? (
        <Text style={styles.counter}>
          {value.length} / {max}
        </Text>
      ) : null}
    </View>
  );
}

export default function BacklogTicketForm({
  title,
  description,
  editable,
  onChangeTitle,
  onChangeDescription,
}: {
  title: string;
  description: string;
  editable: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <>
      <View style={styles.section}>
        <SectionHeader
          title="Title"
          value={title}
          max={TITLE_MAX_LENGTH}
          editable={editable}
        />

        {editable ? (
          <TextInput
            style={[styles.input, styles.titleInput]}
            value={title}
            onChangeText={onChangeTitle}
            placeholder="One line — what is this about?"
            placeholderTextColor={theme.textTertiary}
            maxLength={TITLE_MAX_LENGTH}
            returnKeyType="next"
            inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
          />
        ) : (
          <Text style={styles.readOnlyTitle}>{title}</Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Description"
          value={description}
          max={DESCRIPTION_MAX_LENGTH}
          editable={editable}
        />

        {editable ? (
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            value={description}
            onChangeText={onChangeDescription}
            placeholder="What were you doing, and what happened? The more detail, the faster it gets fixed."
            placeholderTextColor={theme.textTertiary}
            maxLength={DESCRIPTION_MAX_LENGTH}
            multiline
            textAlignVertical="top"
            inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
          />
        ) : (
          <Text style={styles.readOnlyBody}>{description}</Text>
        )}
      </View>
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    section: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 16,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "card"),
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      ...typeScale.title3,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    requiredBadge: {
      backgroundColor: theme.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    requiredText: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.onAccent,
      letterSpacing: 0.5,
    },
    counter: {
      ...typeScale.caption,
      color: theme.textTertiary,
      marginLeft: "auto",
    },
    input: {
      backgroundColor: theme.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: radius.control,
      paddingHorizontal: 14,
      paddingVertical: 12,
      ...typeScale.body,
      color: theme.textPrimary,
    },
    titleInput: { fontWeight: "600" },
    descriptionInput: { minHeight: 160 },
    readOnlyTitle: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.header,
    },
    readOnlyBody: {
      ...typeScale.callout,
      color: theme.textSecondary,
      lineHeight: 22,
    },
  });
