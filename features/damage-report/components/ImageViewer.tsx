import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export interface ImageViewerItem {
  id: string;
  uri: string;
  thumbnail?: string;
}

interface Props {
  images: ImageViewerItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MIN_SCALE = 1;
const MAX_SCALE = 5;

// ── Zoomable image wrapper ──────────────────────────────────────────────────

function ZoomableImage({
  item,
  onLoadStart,
  onLoadEnd,
  onError,
  isLoading,
  hasError,
  onZoomChange,
}: {
  item: ImageViewerItem;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onError: () => void;
  isLoading: boolean;
  hasError: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const clampTranslation = useCallback(
    (
      tx: number,
      ty: number,
      s: number,
    ): { x: number; y: number } => {
      const maxX = ((s - 1) * SCREEN_W) / 2;
      const maxY = ((s - 1) * (SCREEN_H * 0.75)) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, tx)),
        y: Math.min(maxY, Math.max(-maxY, ty)),
      };
    },
    [],
  );

  const resetZoom = useCallback(() => {
    "worklet";
    scale.value = withTiming(1, { duration: 250 });
    translateX.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    runOnJS(onZoomChange)(false);
  }, [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY, onZoomChange]);

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = newScale;

      if (newScale > 1) {
        const dx = (focalX.value - SCREEN_W / 2) * (1 - e.scale);
        const dy = (focalY.value - SCREEN_H / 2) * (1 - e.scale);
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
      const maxX = ((scale.value - 1) * SCREEN_W) / 2;
      const maxY = ((scale.value - 1) * (SCREEN_H * 0.75)) / 2;
      const cx = Math.min(maxX, Math.max(-maxX, translateX.value));
      const cy = Math.min(maxY, Math.max(-maxY, translateY.value));
      translateX.value = withTiming(cx, { duration: 150 });
      translateY.value = withTiming(cy, { duration: 150 });
      savedTranslateX.value = cx;
      savedTranslateY.value = cy;
      runOnJS(onZoomChange)(true);
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      const maxX = ((scale.value - 1) * SCREEN_W) / 2;
      const maxY = ((scale.value - 1) * (SCREEN_H * 0.75)) / 2;
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
        const dx = (SCREEN_W / 2 - e.x) * (targetScale - 1);
        const dy = (SCREEN_H / 2 - e.y) * (targetScale - 1);
        const maxX = ((targetScale - 1) * SCREEN_W) / 2;
        const maxY = ((targetScale - 1) * (SCREEN_H * 0.75)) / 2;
        const cx = Math.min(maxX, Math.max(-maxX, dx));
        const cy = Math.min(maxY, Math.max(-maxY, dy));
        translateX.value = withTiming(cx, { duration: 300 });
        translateY.value = withTiming(cy, { duration: 300 });
        savedTranslateX.value = cx;
        savedTranslateY.value = cy;
        runOnJS(onZoomChange)(true);
      }
    });

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    doubleTap,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const imageSource = hasError && item.thumbnail
    ? { uri: `data:image/jpeg;base64,${item.thumbnail}` }
    : { uri: item.uri };

  return (
    <View style={styles.slide}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imageWrap, animatedStyle]}>
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

// ── Main viewer ─────────────────────────────────────────────────────────────

export function ImageViewer({ images, initialIndex, visible, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  const [errorSet, setErrorSet] = useState<Set<string>>(new Set());
  const [isZoomed, setIsZoomed] = useState(false);
  const listRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: ImageViewerItem }) => (
      <ZoomableImage
        item={item}
        isLoading={loadingSet.has(item.id)}
        hasError={errorSet.has(item.id)}
        onLoadStart={() => setLoadingSet((s) => new Set(s).add(item.id))}
        onLoadEnd={() =>
          setLoadingSet((s) => {
            const next = new Set(s);
            next.delete(item.id);
            return next;
          })
        }
        onError={() => setErrorSet((s) => new Set(s).add(item.id))}
        onZoomChange={setIsZoomed}
      />
    ),
    [loadingSet, errorSet],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.backdrop}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        {/* Counter */}
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>

        {/* Image carousel — disable swiping while zoomed */}
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />

        {/* Page dots */}
        {images.length > 1 && images.length <= 10 && (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
  },
  counterText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imageWrap: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
  },
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
  dots: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    backgroundColor: "#FFF",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
