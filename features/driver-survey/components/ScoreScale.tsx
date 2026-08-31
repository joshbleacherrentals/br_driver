import { typeScale, type ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { SCORE_MAX, SCORE_MIN } from "../utils/surveyValidation";

const SCORES = Array.from(
  { length: SCORE_MAX - SCORE_MIN + 1 },
  (_, index) => SCORE_MIN + index,
);

type ScoreScaleProps = {
  value: number | null;
  onChange: (score: number) => void;
};

/**
 * The 1-10 scale.
 *
 * Two rows of five rather than one row of ten: at ten across, each target is
 * roughly 30pt wide on a small phone, which is below the 44pt minimum and lands
 * the wrong number under a gloved thumb often enough to matter on a survey
 * nobody can dismiss and correct later.
 */
export default function ScoreScale({ value, onChange }: ScoreScaleProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      <View style={styles.grid}>
        {SCORES.map((score) => {
          const selected = value === score;
          return (
            <TouchableOpacity
              key={score}
              style={[styles.cell, selected && styles.cellSelected]}
              onPress={() => onChange(score)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${score} out of ${SCORE_MAX}`}
            >
              <Text style={[styles.cellText, selected && styles.cellTextSelected]}>
                {score}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Not at all satisfied</Text>
        <Text style={styles.legendText}>Extremely satisfied</Text>
      </View>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    cell: {
      // Five per row, whatever the phone's width.
      flexBasis: "18%",
      flexGrow: 1,
      minHeight: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    cellSelected: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    cellText: {
      ...typeScale.headline,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    cellTextSelected: {
      color: theme.onAccent,
    },
    legend: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
    },
    legendText: {
      ...typeScale.caption,
      fontWeight: "400",
      color: theme.textSecondary,
    },
  });
}
