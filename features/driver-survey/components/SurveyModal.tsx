import { typeScale, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  isReasonRequired,
  isSubmittable,
  type SurveyDraftAnswer,
  type SurveyQuestion,
} from "../utils/surveyValidation";
import ScoreScale from "./ScoreScale";

const EMPTY_DRAFT: SurveyDraftAnswer = { score: null, reason: "" };
const REASON_MAX_LENGTH = 1000;

type SurveyModalProps = {
  visible: boolean;
  title: string | null;
  questions: readonly SurveyQuestion[];
  submitting: boolean;
  onSubmit: (drafts: Record<string, SurveyDraftAnswer>) => void;
};

/**
 * The survey itself, as a modal with no way out.
 *
 * That is the requirement, not an oversight: there is no close button, no
 * backdrop dismissal, no swipe, and `onRequestClose` is a no-op so the Android
 * hardware back button does nothing either. The only control that ends this
 * screen is Submit, and Submit stays disabled until every required question has
 * an answer the server will also accept.
 *
 * It is still offline-safe and quick to satisfy: the write lands in the local
 * database, so the modal closes on a phone with no signal exactly as fast as on
 * one with five bars.
 */
export default function SurveyModal({
  visible,
  title,
  questions,
  submitting,
  onSubmit,
}: SurveyModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [drafts, setDrafts] = useState<Record<string, SurveyDraftAnswer>>({});

  const draftFor = useCallback(
    (questionId: string) => drafts[questionId] ?? EMPTY_DRAFT,
    [drafts],
  );

  const setScore = useCallback((questionId: string, score: number) => {
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...(current[questionId] ?? EMPTY_DRAFT), score },
    }));
  }, []);

  const setReason = useCallback((questionId: string, reason: string) => {
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...(current[questionId] ?? EMPTY_DRAFT), reason },
    }));
  }, []);

  const canSubmit = useMemo(
    () => isSubmittable(questions, drafts),
    [questions, drafts],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Deliberately inert: on Android this is the hardware back button, and
      // this survey has to be answered.
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.centered}
        >
          <View style={styles.card}>
            <Text style={styles.badge}>Quick check-in</Text>
            <Text style={styles.title}>{title ?? "How are we doing?"}</Text>
            <Text style={styles.subtitle}>
              One question, then straight back to work. Your answer goes to the
              team that builds this app.
            </Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {questions.map((question) => {
                const draft = draftFor(question.id);
                const needsReason = isReasonRequired(question, draft.score);
                const isTextOnly = question.kind === "text";

                return (
                  <View key={question.id} style={styles.question}>
                    <Text style={styles.prompt}>{question.prompt}</Text>

                    {!isTextOnly && (
                      <ScoreScale
                        value={draft.score}
                        onChange={(score) => setScore(question.id, score)}
                      />
                    )}

                    {(needsReason || isTextOnly) && (
                      <View style={styles.reasonBlock}>
                        <Text style={styles.reasonLabel}>
                          {question.follow_up_prompt ??
                            "Tell us what went wrong"}
                        </Text>
                        <TextInput
                          style={styles.reasonInput}
                          value={draft.reason}
                          onChangeText={(text) => setReason(question.id, text)}
                          placeholder="Required"
                          multiline
                          maxLength={REASON_MAX_LENGTH}
                          textAlignVertical="top"
                          accessibilityLabel="Reason for your score"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={() => onSubmit(drafts)}
              disabled={!canSubmit || submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 20,
      gap: 8,
      maxHeight: "88%",
    },
    badge: {
      ...typeScale.footnote,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: theme.accent,
    },
    title: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    subtitle: {
      ...typeScale.subhead,
      color: theme.textSecondary,
    },
    scroll: {
      marginTop: 8,
    },
    scrollContent: {
      gap: 20,
      paddingBottom: 4,
    },
    question: {
      gap: 12,
    },
    prompt: {
      ...typeScale.headline,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    reasonBlock: {
      gap: 6,
    },
    reasonLabel: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    reasonInput: {
      ...typeScale.callout,
      minHeight: 88,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceElevated,
      color: theme.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    submit: {
      marginTop: 12,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    submitDisabled: {
      opacity: 0.4,
    },
    submitText: {
      ...typeScale.headline,
      fontWeight: "700",
      color: theme.onAccent,
    },
  });
}
