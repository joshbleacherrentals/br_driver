import { ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, style }: CardProps) {
  const styles = useThemedStyles(makeStyles);

  return <View style={[styles.card, style]}>{children}</View>;
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      backgroundColor: theme.surface,
      borderColor: theme.border,
    },
  });
