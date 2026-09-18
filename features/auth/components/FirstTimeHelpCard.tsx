import { radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const STEPS = [
  'Find the email "Invitation to join Bleacher Rentals". Check your Spam folder too.',
  'Tap "Accept invitation", enter your name and create a password.',
  "Come back here and sign in with that same email and password.",
];

/**
 * Explains to new drivers that accounts can't be created in the app — they
 * come from an Account Manager's email invitation. Collapsed by default so
 * returning drivers aren't pushed away from the sign-in form.
 */
export default function FirstTimeHelpCard() {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.accentSoft, borderColor: theme.border },
      ]}
    >
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.titleRow}
      >
        <Ionicons name="mail-outline" size={20} color={theme.accent} />
        <View style={styles.titleTextWrap}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            First time here?
          </Text>
          {!expanded && (
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Tap to see how to get your account
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.accent}
        />
      </Pressable>

      {expanded && (
        <>
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            You can&apos;t sign up in this app. Your Account Manager creates
            your account and sends you an invitation email.
          </Text>

          {STEPS.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View
                style={[styles.stepBadge, { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.stepNumber, { color: theme.onAccent }]}>
                  {idx + 1}
                </Text>
              </View>
              <Text style={[styles.stepText, { color: theme.textPrimary }]}>
                {step}
              </Text>
            </View>
          ))}

          <Text style={[styles.text, { color: theme.textSecondary }]}>
            Used Google or Apple in step 2? Use the same button here.
          </Text>
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            No email, or it&apos;s older than 30 days? Ask your Account Manager
            to send a new one.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 28,
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleTextWrap: {
    flex: 1,
  },
  title: {
    ...typeScale.headline,
    fontWeight: "700",
  },
  text: {
    ...typeScale.subhead,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepText: {
    ...typeScale.subhead,
    flex: 1,
  },
});
