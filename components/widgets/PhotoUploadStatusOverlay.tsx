import { DustDissolve } from "@/components/widgets/DustDissolve";
import { elevation, radius, ThemeColors, typeScale } from "@/constants/theme";
import { usePhotoUploadOverlay } from "@/hooks/usePhotoUploadOverlay";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { getPhotoUploadService } from "@/library/photoUploadQueue";
import type { PhotoUploadOverlayState } from "@/library/photoUploadQueue";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import React, { useContext } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The one app-wide photo-upload banner — uploading, success, failed.
 *
 * It floats over the screen instead of sitting in it. Photo upload is
 * background work: it starts on one screen, finishes on another, and must never
 * push a driver's content around or make them wait. So this is an absolutely
 * positioned overlay pinned to the bottom of whatever screen mounts it, above
 * the tab bar and clear of the home indicator, with `pointerEvents="box-none"`
 * so only the pill itself is tappable and the screen underneath keeps working.
 *
 * Bottom rather than top because the top of these screens already belongs to
 * the navigation header and the onboarding / document-expiry banners; a
 * transient progress pill has no business displacing any of them. The geometry
 * (`bottom: 24`, 16pt side margins, `elevation(theme, "floating")`) is copied
 * from the undo toast in `features/availability/AvailabilityScreen.tsx`, which
 * is this app's existing floating-over-content pattern.
 *
 * The three states are mutually exclusive by construction — see
 * `library/photoUploadQueue/overlayState.ts` for the precedence and why. Only
 * the failed one is tappable, and only it persists; it keeps the behaviour of
 * the `PhotoUploadIssueBanner` it replaces exactly, including kicking the queue
 * on the way to the report ("tap to retry" is literal).
 */

/** Matches the undo toast's resting position. */
const BASE_BOTTOM = 24;

interface Props {
  /**
   * Extra clearance for a screen that already owns its bottom corner — a FAB,
   * a save/discard action bar. Screens pass their own control's height rather
   * than this component trying to discover it.
   */
  bottomInset?: number;
}

export default function PhotoUploadStatusOverlay({ bottomInset = 0 }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { state, endCelebration } = usePhotoUploadOverlay();

  // Inside the tab navigator the tab bar is laid out *below* the screen (it is
  // only `position: absolute` while hidden) and it carries `paddingBottom:
  // insets.bottom` itself, so the screen's own bottom edge is already clear of
  // both the bar and the home indicator — adding an inset there would float the
  // pill needlessly high. Off the tabs (the standalone damage-report screen)
  // there is no such bar and the inset is the driver's only protection.
  //
  // `useBottomTabBarHeight()` throws outside a tab navigator; reading the
  // context directly answers `undefined` instead, which is the distinction
  // being made here.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const bottom =
    BASE_BOTTOM + bottomInset + (tabBarHeight === undefined ? insets.bottom : 0);

  if (state.kind === "hidden") return null;

  const handleFailedPress = (targetReportUuid: string) => {
    void getPhotoUploadService()?.triggerFast("manual-retry");
    router.push({
      pathname: "/damage-report",
      params: { damageReportId: targetReportUuid },
    });
  };

  return (
    <View
      style={[styles.overlay, { bottom }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(220)}
      >
        {state.kind === "success" ? (
          <DustDissolve color={theme.onSecondaryAccent} onDone={endCelebration}>
            <Pill state={state} styles={styles} theme={theme} />
          </DustDissolve>
        ) : state.kind === "failed" ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleFailedPress(state.targetReportUuid)}
            accessibilityRole="button"
            accessibilityLabel={`${state.title}. ${state.subtitle}`}
          >
            <Pill state={state} styles={styles} theme={theme} />
          </TouchableOpacity>
        ) : (
          <Pill state={state} styles={styles} theme={theme} />
        )}
      </Animated.View>
    </View>
  );
}

const ICONS: Record<
  Exclude<PhotoUploadOverlayState["kind"], "hidden">,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  uploading: "cloud-upload-outline",
  success: "checkmark-circle-outline",
  failed: "cloud-offline-outline",
};

/**
 * The visual body, shared by all three states.
 *
 * Shaped after `features/trips/components/ReleasedTripsBanner.tsx` — the same
 * solid fill, 36pt icon circle and title/subtitle block — with the state
 * choosing only the fill and the trailing affordance. Crucially, none of the
 * three has a repeating animation: the calm states because progress is
 * information and not an alarm, and the failed state because a steady red fill
 * already says everything a pulse would, without training the driver to ignore
 * it.
 */
function Pill({
  state,
  styles,
  theme,
}: {
  state: Exclude<PhotoUploadOverlayState, { kind: "hidden" }>;
  styles: ReturnType<typeof makeStyles>;
  theme: ThemeColors;
}) {
  const fillStyle =
    state.kind === "success"
      ? styles.fillSuccess
      : state.kind === "failed"
        ? styles.fillFailed
        : styles.fillUploading;
  const foreground =
    state.kind === "success" ? theme.onSecondaryAccent : theme.onAccent;

  return (
    <View style={[styles.pill, fillStyle]}>
      <View style={styles.row}>
        {/* The foreground token differs per fill (`onAccent` vs
            `onSecondaryAccent`), so it is applied here rather than baked into
            the shared stylesheet. */}
        <View
          style={[styles.iconCircle, { backgroundColor: foreground + "26" }]}
        >
          <Ionicons name={ICONS[state.kind]} size={20} color={foreground} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: foreground }]} numberOfLines={1}>
            {state.title}
          </Text>
          <Text
            style={[styles.sub, { color: foreground + "CC" }]}
            numberOfLines={2}
          >
            {state.subtitle}
          </Text>
        </View>
        {state.kind === "failed" ? (
          <Ionicons name="chevron-forward" size={20} color={foreground} />
        ) : null}
      </View>

      {state.kind === "uploading" ? (
        <View
          style={styles.trackOuter}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: state.uploaded, min: 0, max: state.total }}
        >
          <View
            style={[
              styles.trackFill,
              { width: `${Math.round(state.ratio * 100)}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      position: "absolute",
      left: 16,
      right: 16,
      // Above the screen's own content, and above the tab bar's blur on
      // Android, where `elevation` rather than order decides.
      zIndex: 40,
    },
    pill: {
      borderRadius: radius.card,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 8,
      ...elevation(theme, "floating"),
    },
    fillUploading: { backgroundColor: theme.accent },
    fillSuccess: { backgroundColor: theme.secondaryAccent },
    fillFailed: { backgroundColor: theme.danger },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.onAccent + "26",
    },
    textBlock: { flex: 1 },
    title: {
      ...typeScale.footnote,
      fontWeight: "700",
      color: theme.onAccent,
    },
    sub: {
      ...typeScale.caption,
      marginTop: 1,
      color: theme.onAccent + "CC",
    },
    trackOuter: {
      width: "100%",
      height: 4,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: theme.onAccent + "33",
    },
    trackFill: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: theme.onAccent,
    },
  });
