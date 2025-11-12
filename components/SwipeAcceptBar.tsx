import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";

type Props = {
  label?: string; // e.g., "Slide to accept"
  readyLabel?: string; // e.g., "Release to accept"
  height?: number;
  handleSize?: number;
  borderRadius?: number;
};

// A bottom bar with a draggable handle from left to right (visual only)
export default function SwipeAcceptBar({
  label = "Slide to accept",
  readyLabel = "Release to accept",
  height = 44,
  handleSize = 36,
  borderRadius = 12,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentXRef = useRef(0);
  const startXRef = useRef(0);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  const padding = 4;
  const contentWidth = Math.max(0, width - padding * 2);
  const maxX = useMemo(() => Math.max(0, width - handleSize - padding * 2), [width, handleSize]);
  const threshold = useMemo(() => maxX * 0.65, [maxX]);
  const acceptEndThreshold = useMemo(() => maxX * 0.95, [maxX]);

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
          // Remember where we started so we can continue from current position
          startXRef.current = currentXRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const dx = Math.max(0, Math.min(maxX, startXRef.current + gesture.dx));
          translateX.setValue(dx);
          const nextReady = dx >= threshold;
          if (nextReady !== ready) setReady(nextReady);
        },
        onPanResponderRelease: () => {
          if (accepted) return;
          const x = currentXRef.current;
          if (x >= acceptEndThreshold) {
            Animated.spring(translateX, { toValue: maxX, useNativeDriver: true }).start(() => {
              Animated.parallel([
                Animated.spring(checkScale, { toValue: 1, useNativeDriver: true }),
                Animated.timing(checkOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
              ]).start(() => setAccepted(true));
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
    [accepted, acceptEndThreshold, checkOpacity, checkScale, maxX, ready, threshold, translateX]
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Progress as a 0..1 scale based on translateX; we scale the fill instead of animating width
  const progress = useMemo(() => {
    if (accepted) return new Animated.Value(1);
    if (!contentWidth) return new Animated.Value(0);
    const widthVal = new Animated.Value(contentWidth);
    const handleVal = new Animated.Value(handleSize);
    return Animated.divide(Animated.add(translateX, handleVal), widthVal);
  }, [contentWidth, handleSize, translateX, accepted]);

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout} {...panResponder.panHandlers}>
      {/* Track background */}
      <View style={[styles.track, { borderRadius }]} />
      {/* Progress fill (scaled, native-driver friendly) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { borderRadius, width: contentWidth, left: padding },
          // anchor scale to left by translating to center and back
          contentWidth
            ? {
                transform: [
                  { translateX: -contentWidth / 2 },
                  { scaleX: progress },
                  { translateX: contentWidth / 2 },
                ],
              }
            : undefined,
        ]}
      />
      {/* Center label */}
      <View pointerEvents="none" style={styles.labelContainer}>
        {!accepted && (
          <Text style={[styles.label, ready && styles.readyLabel]}>
            {ready ? readyLabel : label}
          </Text>
        )}
        {accepted && (
          <Animated.Text
            style={[
              styles.acceptedText,
              { opacity: checkOpacity, transform: [{ scale: checkScale }] },
            ]}
          >
            ✓ Accepted
          </Animated.Text>
        )}
      </View>
      {/* Handle */}
      {!accepted && (
        <Animated.View
          style={[
            styles.handle,
            {
              width: handleSize,
              height: handleSize,
              borderRadius: 8,
              transform: [{ translateX }],
              left: padding,
            },
          ]}
        >
          <Text style={styles.handleText}>›</Text>
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
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#34C759",
  },
  labelContainer: {
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
  readyLabel: {
    color: "#0A7C2E",
    fontWeight: "700",
  },
  handle: {
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
  handleText: {
    fontSize: 22,
    color: "#333",
    paddingBottom: 2,
  },
  acceptedText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A7C2E",
  },
});
