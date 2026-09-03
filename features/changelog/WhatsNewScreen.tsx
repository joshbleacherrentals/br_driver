import { ThemeColors, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React, { useEffect } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChangeLog } from "./ChangeLogProvider";
import ReleaseCard from "./components/ReleaseCard";

/**
 * Every release, newest first.
 *
 * The notes ship directly in the bundle (`entries.json`), so this screen
 * reads nothing from the network or the local database — it renders
 * identically with the phone offline.
 */
export default function WhatsNewScreen() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { entries, markAllRead } = useChangeLog();

  // Opening the page clears the unread dot.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.version}
        renderItem={({ item, index }) => (
          <ReleaseCard entry={item} isLatest={index === 0} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Everything we&apos;ve added to the app, newest first.
          </Text>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No updates yet. Check back after the next release.
          </Text>
        }
      />
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    list: { padding: 16, gap: 16 },
    intro: {
      ...typeScale.subhead,
      color: theme.textSecondary,
      paddingHorizontal: 2,
    },
    empty: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      textAlign: "center",
      paddingTop: 40,
    },
  });
