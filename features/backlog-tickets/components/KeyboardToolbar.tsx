/**
 * A way out of the keyboard that does not depend on finding a gap to tap.
 *
 * This screen is two text fields and very little else: once the description has
 * focus, the keyboard covers most of the page and there is no neutral area left
 * to tap to dismiss it. Drivers wear gloves and use one hand — "tap precisely
 * on the 40pt of background that is still showing" is not a dismissal gesture.
 *
 * Two affordances, because the platforms differ in what they can offer:
 *
 * - iOS gets a real `InputAccessoryView`, a bar riding on top of the keyboard.
 *   It is the native pattern and it is always exactly where the thumb is.
 * - Android has no such API, so the button is a floating pill pinned to the
 *   bottom of the (resized) window, which sits directly above the keyboard.
 *
 * Both are in addition to `keyboardDismissMode` on the scroll view, which makes
 * the swipe-down gesture work.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/** Pass to every `TextInput` on the screen as `inputAccessoryViewID`. */
export const KEYBOARD_ACCESSORY_ID = "backlog-ticket-keyboard";

function DismissButton() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => Keyboard.dismiss()}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Hide keyboard"
    >
      <Text style={styles.label}>Hide Keyboard</Text>
      <Ionicons name="chevron-down" size={16} color={theme.accent} />
    </TouchableOpacity>
  );
}

export default function KeyboardToolbar() {
  const styles = useThemedStyles(makeStyles);
  const [androidVisible, setAndroidVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") return;

    const show = Keyboard.addListener("keyboardDidShow", () =>
      setAndroidVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setAndroidVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === "ios") {
    return (
      <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
        <View style={styles.accessoryBar}>
          <DismissButton />
        </View>
      </InputAccessoryView>
    );
  }

  if (!androidVisible) return null;

  return (
    <View style={styles.androidAnchor} pointerEvents="box-none">
      <DismissButton />
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    accessoryBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    androidAnchor: {
      position: "absolute",
      right: 16,
      bottom: 8,
      zIndex: 20,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: theme.accentSoft,
    },
    label: {
      ...typeScale.footnote,
      fontWeight: "700",
      color: theme.accent,
    },
  });
