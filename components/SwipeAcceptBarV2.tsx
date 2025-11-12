import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";

type Props = {
  label?: string; // Center prompt before accept
  acceptedLabel?: string; // Center prompt after accept
  height?: number; // Total bar height
  thumbWidth?: number; // Thumb card width
  thumbRadius?: number; // Thumb corner radius
  borderRadius?: number; // Track corner radius
  onAccepted?: () => void; // Optional callback when accepted
};

// V2 swipe: only the thumb is the draggable "card"; underneath is the green progress/accepted UI.
export default function SwipeAcceptBarV2({
  label = "Slide to accept",
  acceptedLabel = "✓ Accepted",
  height = 48,
  thumbWidth = 56,
  thumbRadius = 10,
  borderRadius = 12,
  onAccepted,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentXRef = useRef(0);
  const startXRef = useRef(0);
  const [width, setWidth] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState(false);

  const padding = 4; // inner padding so thumb has a gutter
  const trackWidth = Math.max(0, width - padding * 2);
  const maxX = Math.max(0, trackWidth - thumbWidth); // rightmost x for thumb
  const threshold = maxX * 0.65; // show "release to accept"
  const acceptEndThreshold = maxX * 0.97; // consider full accept near end

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentXRef.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !accepted,
        onMoveShouldSetPanResponder: (_e, g) => {
          if (accepted) return false;
          return Math.abs(g.dx) > Math.abs(g.dy) + 2; // horizontal intent
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startXRef.current = currentXRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.max(0, Math.min(maxX, startXRef.current + g.dx));
          translateX.setValue(next);
          const showReady = next >= threshold;
          if (showReady !== ready) setReady(showReady);
        },
        onPanResponderRelease: () => {
          if (accepted) return;
          const x = currentXRef.current;
          if (x >= acceptEndThreshold) {
            Animated.spring(translateX, { toValue: maxX, useNativeDriver: true }).start(() => {
              // Subtle success pop of label
              setAccepted(true);
              onAccepted?.();
            });
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(() => {
              if (ready) setReady(false);
            });
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [accepted, acceptEndThreshold, maxX, ready, threshold, translateX, onAccepted]
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Fill progress: (thumb x + thumb width) / trackWidth
  const progress = useMemo(() => {
    if (accepted) return new Animated.Value(1);
    if (!trackWidth) return new Animated.Value(0);
    const trackVal = new Animated.Value(trackWidth);
    const tw = new Animated.Value(thumbWidth);
    return Animated.divide(Animated.add(translateX, tw), trackVal);
  }, [trackWidth, thumbWidth, translateX, accepted]);

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {/* Track background (grey) */}
      <View style={[styles.track, { borderRadius }]} />

      {/* Green fill scaled from left */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { borderRadius, left: padding, width: trackWidth },
          trackWidth
            ? {
                transform: [
                  { translateX: -trackWidth / 2 },
                  { scaleX: progress },
                  { translateX: trackWidth / 2 },
                ],
              }
            : undefined,
        ]}
      />

      {/* Center text */}
      <View pointerEvents="none" style={styles.centerText}>
        {!accepted ? (
          <Text style={[styles.label, ready && styles.ready]}>
            {ready ? "Release to accept" : label}
          </Text>
        ) : (
          <Text style={styles.accepted}>{acceptedLabel}</Text>
        )}
      </View>

      {/* Thumb card */}
      {!accepted && (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbWidth,
              borderRadius: thumbRadius,
              height: height - padding * 2,
              left: padding,
              transform: [{ translateX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.chevron}>{"›"}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    marginTop: 12,
    marginHorizontal: 0,
    justifyContent: "center",
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#EFEFEF",
  },
  fill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    backgroundColor: "#34C759",
  },
  centerText: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  ready: {
    color: "#0A7C2E",
    fontWeight: "700",
  },
  accepted: {
    fontSize: 16,
    color: "#0A7C2E",
    fontWeight: "700",
  },
  thumb: {
    position: "absolute",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chevron: {
    fontSize: 22,
    color: "#333",
    paddingBottom: 2,
  },
});
