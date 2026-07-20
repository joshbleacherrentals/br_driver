import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type ZoomableImageSource = {
  id: string;
  uri: string;
  thumbnail?: string;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DEFAULT_IMAGE_H = SCREEN_H * 0.75;

type Props = {
  item: ZoomableImageSource;
  onZoomChange?: (zoomed: boolean) => void;
  isLoading?: boolean;
  hasError?: boolean;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: () => void;
  width?: number;
  height?: number;
  /** Outer slide height (defaults to full window — use a shorter value inside sheets). */
  slideHeight?: number;
};

/**
 * Pinch / double-tap zoomable image. Pan only moves the image while zoomed
 * so parent carousels can keep horizontal paging when scale === 1.
 */
export default function ZoomableImage({
  item,
  onZoomChange,
  isLoading = false,
  hasError = false,
  onLoadStart,
  onLoadEnd,
  onError,
  width = SCREEN_W,
  height = DEFAULT_IMAGE_H,
  slideHeight = SCREEN_H,
}: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const notifyZoom = useCallback(
    (zoomed: boolean) => {
      onZoomChange?.(zoomed);
    },
    [onZoomChange],
  );

  const resetZoom = useCallback(() => {
    "worklet";
    scale.value = withTiming(1, { duration: 250 });
    translateX.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    runOnJS(notifyZoom)(false);
  }, [
    scale,
    translateX,
    translateY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    notifyZoom,
  ]);

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, savedScale.value * e.scale),
      );
      scale.value = newScale;

      if (newScale > 1) {
        const dx = (focalX.value - width / 2) * (1 - e.scale);
        const dy = (focalY.value - height / 2) * (1 - e.scale);
        translateX.value = savedTranslateX.value + dx;
        translateY.value = savedTranslateY.value + dy;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        resetZoom();
        return;
      }
      savedScale.value = scale.value;
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      const cx = Math.min(maxX, Math.max(-maxX, translateX.value));
      const cy = Math.min(maxY, Math.max(-maxY, translateY.value));
      translateX.value = withTiming(cx, { duration: 150 });
      translateY.value = withTiming(cy, { duration: 150 });
      savedTranslateX.value = cx;
      savedTranslateY.value = cy;
      runOnJS(notifyZoom)(true);
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .minPointers(1)
    .maxPointers(2)
    .onTouchesMove((_, state) => {
      // Fail when not zoomed so parent carousel / dismiss pan can take the gesture.
      if (savedScale.value > 1) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      translateX.value = Math.min(
        maxX,
        Math.max(-maxX, savedTranslateX.value + e.translationX),
      );
      translateY.value = Math.min(
        maxY,
        Math.max(-maxY, savedTranslateY.value + e.translationY),
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (savedScale.value > 1) {
        resetZoom();
      } else {
        const targetScale = 3;
        scale.value = withTiming(targetScale, { duration: 300 });
        savedScale.value = targetScale;
        const dx = (width / 2 - e.x) * (targetScale - 1);
        const dy = (height / 2 - e.y) * (targetScale - 1);
        const maxX = ((targetScale - 1) * width) / 2;
        const maxY = ((targetScale - 1) * height) / 2;
        const cx = Math.min(maxX, Math.max(-maxX, dx));
        const cy = Math.min(maxY, Math.max(-maxY, dy));
        translateX.value = withTiming(cx, { duration: 300 });
        translateY.value = withTiming(cy, { duration: 300 });
        savedTranslateX.value = cx;
        savedTranslateY.value = cy;
        runOnJS(notifyZoom)(true);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const imageSource =
    hasError && item.thumbnail
      ? { uri: `data:image/jpeg;base64,${item.thumbnail}` }
      : { uri: item.uri };

  return (
    <View style={[styles.slide, { width, height: slideHeight }]}>
      <GestureDetector gesture={composed}>
        <Animated.View
          style={[styles.imageWrap, { width, height }, animatedStyle]}
        >
          <Animated.Image
            source={imageSource}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
            onError={onError}
          />
        </Animated.View>
      </GestureDetector>

      {isLoading && (
        <ActivityIndicator
          size="large"
          color="#FFF"
          style={StyleSheet.absoluteFill}
        />
      )}
      {hasError && !item.thumbnail && (
        <View style={styles.errorOverlay}>
          <Ionicons name="cloud-offline-outline" size={48} color="#8E8E93" />
          <Text style={styles.errorText}>Unable to load image</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imageWrap: {},
  image: {
    width: "100%",
    height: "100%",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#8E8E93",
    fontSize: 14,
    marginTop: 8,
  },
});
