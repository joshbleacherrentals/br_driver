import { useIsFocused } from "@react-navigation/native";
import React from "react";

/**
 * React Navigation 7 removed `unmountOnBlur` from bottom tabs.
 * This HOC restores that behavior for rare/heavy screens so hooks
 * and list state release when the tab loses focus.
 */
export function withUnmountOnBlur<P extends object>(
  Component: React.ComponentType<P>,
) {
  function UnmountOnBlurScreen(props: P) {
    const isFocused = useIsFocused();
    if (!isFocused) return null;
    return <Component {...props} />;
  }

  UnmountOnBlurScreen.displayName = `withUnmountOnBlur(${
    Component.displayName ?? Component.name ?? "Screen"
  })`;

  return UnmountOnBlurScreen;
}
