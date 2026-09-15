/**
 * Assets — the whole bleacher fleet, read-only.
 *
 * Reference material, not a workflow: nothing here writes, and nothing here
 * depends on the trip a driver happens to be on. A driver standing in a yard
 * types the number off the trailer and reads back what the office knows about
 * it — seats, hitch, GVWR, when its annual inspection is due.
 *
 * Every row comes from the local database, so the list is complete with the
 * phone in airplane mode. The only thing that needs a connection is opening a
 * PDF, and the detail screen says so rather than failing silently.
 */

import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";

import AssetListItem from "./components/AssetListItem";
import AssetSearchBar from "./components/AssetSearchBar";
import { useAssetList } from "./hooks/useAssetList";
import type { AssetListRow } from "./utils/bleacherAssetView";

/** Row height + gap, so the list can place rows without measuring them. */
const ROW_HEIGHT = 62;
const ROW_GAP = 10;

function keyExtractor(row: AssetListRow): string {
  return row.id;
}

export default function AssetsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const { rows, fleetSize } = useAssetList(query);

  const openAsset = useCallback(
    (bleacherId: string) => {
      Keyboard.dismiss();
      router.push({ pathname: "/bleacher-asset", params: { bleacherId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AssetListRow>) => (
      <AssetListItem row={item} onOpen={openAsset} />
    ),
    [openAsset],
  );

  // Fixed-height rows, so the list never measures — the fleet is the longest
  // list in the app and this is what keeps scrolling it cheap.
  const getItemLayout = useCallback(
    (_: ArrayLike<AssetListRow> | null | undefined, index: number) => ({
      length: ROW_HEIGHT + ROW_GAP,
      offset: (ROW_HEIGHT + ROW_GAP) * index,
      index,
    }),
    [],
  );

  const searching = query.trim().length > 0;

  return (
    <View style={styles.container}>
      <ProfileCompletionBanner />

      <View style={styles.searchHolder}>
        <AssetSearchBar value={query} onChange={setQuery} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={searching ? "search" : "cube-outline"}
              size={28}
              color={theme.textTertiary}
            />
            <Text style={styles.emptyText}>
              {searching
                ? `No bleacher matching “${query.trim()}”.`
                : fleetSize === 0
                  ? "The fleet has not reached this device yet."
                  : "No bleachers to show."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={separatorStyles.gap} />;
}

const separatorStyles = StyleSheet.create({ gap: { height: ROW_GAP } });

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    searchHolder: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 32 },
    empty: {
      alignItems: "center",
      gap: 10,
      marginTop: 64,
      paddingHorizontal: 32,
    },
    emptyText: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      textAlign: "center",
    },
  });
