import ZoomableImage, {
  ZoomableImageSource,
} from "@/components/widgets/ZoomableImage";
import { shareImage, supabasePublicObjectUrl } from "@/utils/shareImage";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  StatusBar,
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
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";

export type ImageViewerItem = ZoomableImageSource & {
  /** Optional storage path for share fallback when local cache is missing. */
  storagePath?: string;
};

interface Props {
  images: ImageViewerItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  title?: string;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 800;
const IMAGE_HEIGHT = SCREEN_H * 0.75;

export function ImageViewer({
  images,
  initialIndex,
  visible,
  onClose,
  title = "Photos",
}: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  const [errorSet, setErrorSet] = useState<Set<string>>(new Set());
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
    setIsZoomed(false);
    translateY.value = 0;
    opacity.value = 1;
  }, [visible, initialIndex, translateY, opacity]);

  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleShare = useCallback(async () => {
    const current = images[activeIndex];
    if (!current?.uri || isSharing) return;
    setIsSharing(true);
    try {
      await shareImage(current.uri, {
        filenamePrefix: "damage-photo",
        fallbackUrl: current.storagePath
          ? supabasePublicObjectUrl(
              "damage-report-photos",
              current.storagePath,
            ) || undefined
          : undefined,
      });
    } catch (error) {
      Alert.alert(
        "Share failed",
        error instanceof Error ? error.message : "Could not share this photo.",
      );
    } finally {
      setIsSharing(false);
    }
  }, [images, activeIndex, isSharing]);

  const createDismissPan = useCallback(
    (enabled: boolean) =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(12)
        .failOffsetX([-30, 30])
        .onUpdate((e) => {
          const y = Math.max(0, e.translationY);
          translateY.value = y;
          opacity.value = Math.max(0.45, 1 - y / 350);
        })
        .onEnd((e) => {
          const shouldDismiss =
            e.translationY > DISMISS_DISTANCE ||
            e.velocityY > DISMISS_VELOCITY;
          if (shouldDismiss) {
            translateY.value = withTiming(
              SCREEN_H,
              { duration: 200 },
              (finished) => {
                if (finished) runOnJS(dismiss)();
              },
            );
            opacity.value = withTiming(0, { duration: 180 });
          } else {
            translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
            opacity.value = withTiming(1, { duration: 150 });
          }
        }),
    [dismiss, translateY, opacity],
  );

  const headerPan = useMemo(() => createDismissPan(true), [createDismissPan]);
  const listPan = useMemo(
    () => createDismissPan(!isZoomed),
    [createDismissPan, isZoomed],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
        setIsZoomed(false);
      }
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ImageViewerItem }) => (
      <ZoomableImage
        item={item}
        width={SCREEN_W}
        height={IMAGE_HEIGHT}
        slideHeight={IMAGE_HEIGHT}
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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <GestureHandlerRootView style={styles.root} accessibilityViewIsModal>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <Animated.View style={[styles.container, animatedStyle]}>
            <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
              <GestureDetector gesture={headerPan}>
                <Animated.View style={styles.header}>
                  <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={26} color="#FFF" />
                  </TouchableOpacity>

                  <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                      {images.length > 0
                        ? `${activeIndex + 1} / ${images.length}`
                        : "0 / 0"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={handleShare}
                    disabled={isSharing || images.length === 0}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Share photo"
                  >
                    {isSharing ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name="share-outline" size={24} color="#FFF" />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </GestureDetector>

              {images.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="image-outline" size={64} color="#555" />
                  <Text style={styles.emptyText}>Photos not yet downloaded</Text>
                  <Text style={styles.emptySubtext}>
                    They will appear once synced
                  </Text>
                </View>
              ) : (
                <>
                  <GestureDetector gesture={listPan}>
                    <Animated.View style={styles.listWrap}>
                      <FlatList
                        ref={listRef}
                        data={images}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        horizontal
                        pagingEnabled
                        scrollEnabled={!isZoomed}
                        showsHorizontalScrollIndicator={false}
                        initialScrollIndex={Math.min(
                          initialIndex,
                          Math.max(images.length - 1, 0),
                        )}
                        getItemLayout={(_, index) => ({
                          length: SCREEN_W,
                          offset: SCREEN_W * index,
                          index,
                        })}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewabilityConfig}
                      />
                    </Animated.View>
                  </GestureDetector>

                  {images.length > 1 && (
                    <View style={styles.dots}>
                      {images.map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.dot,
                            i === activeIndex && styles.dotActive,
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
            </SafeAreaView>
          </Animated.View>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  headerBtn: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  listWrap: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8E8E93",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#555",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#555",
  },
  dotActive: {
    backgroundColor: "#FFF",
    width: 18,
  },
});
