import NotificationDot from "@/components/ui/NotificationDot";
import { useChangeLog } from "@/features/changelog/ChangeLogProvider";
import ThemeToggle from "@/features/side-navigation/components/ThemeToggle";
import { ThemeColors, typeScale } from "@/constants/theme";
import UserProfileCard from "@/features/side-navigation/components/UserProfileCard";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  /** Rows that can carry an unread dot name the flag that drives it. */
  badge?: "changelog";
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Trip History",
    icon: "time-outline",
    route: "/(drawer)/(tabs)/trip-history",
  },
  {
    label: "My Availability",
    icon: "calendar-outline",
    route: "/(drawer)/(tabs)/driverAvailability",
  },
  {
    label: "Documents",
    icon: "document-text-outline",
    route: "/(drawer)/(tabs)/documents",
  },
  {
    label: "Assets",
    icon: "cube-outline",
    route: "/(drawer)/(tabs)/assets",
  },
  {
    label: "Damage Reports",
    icon: "warning-outline",
    route: "/(drawer)/(tabs)/damage-report-history",
  },
  {
    label: "Direct Line to Developers",
    icon: "chatbubble-ellipses-outline",
    route: "/(drawer)/(tabs)/backlog-tickets",
  },
  {
    label: "What's New",
    icon: "sparkles-outline",
    route: "/(drawer)/(tabs)/whats-new",
    badge: "changelog",
  },
];

interface SideNavigationProps {
  drawerNavigation: DrawerContentComponentProps["navigation"];
}

export default function SideNavigation({
  drawerNavigation,
}: SideNavigationProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? "—";
  const { hasUnread: hasUnreadChangelog } = useChangeLog();

  const handleNav = useCallback(
    (route: string) => {
      drawerNavigation.closeDrawer();
      setTimeout(() => router.push(route as any), 0);
    },
    [drawerNavigation, router],
  );

  return (
    <View style={styles.container}>
      <UserProfileCard />
      <View style={styles.content}>
        <View style={styles.list}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.menuItem}
              onPress={() => handleNav(item.route)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={item.icon as any}
                size={22}
                color={theme.accent}
              />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              {item.badge === "changelog" && hasUnreadChangelog && (
                <View style={styles.badgeAnchor}>
                  <NotificationDot top={-9} right={-9} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={styles.appearance}>
            <Text style={styles.appearanceLabel}>Appearance</Text>
            <ThemeToggle />
          </View>
          <Text style={styles.versionText}>Version {version}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { flex: 1 },
    list: { paddingHorizontal: 20, paddingTop: 8 },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    menuItemLabel: { ...typeScale.callout, color: theme.textPrimary },
    // The dot floats off this zero-size anchor, so it never shifts the label.
    badgeAnchor: { width: 0, height: 0 },
    footer: {
      marginTop: "auto",
      alignItems: "center",
      gap: 20,
      paddingTop: 24,
      paddingHorizontal: 20,
      width: "100%",
    },
    appearance: {
      alignItems: "center",
      gap: 10,
      width: "100%",
    },
    appearanceLabel: {
      ...typeScale.caption2,
      fontWeight: "600",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      textAlign: "center",
      color: theme.textTertiary,
    },
    versionText: {
      textAlign: "center",
      ...typeScale.caption,
      color: theme.textTertiary,
    },
  });
