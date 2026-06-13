import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";

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

export function ImageViewer({ images, initialIndex, visible, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  const [errorSet, setErrorSet] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item }: { item: ImageViewerItem }) => {
      const isLoading = loadingSet.has(item.id);
      const hasError = errorSet.has(item.id);

      return (
        <View style={styles.slide}>
          {hasError && item.thumbnail ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.thumbnail}` }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={{ uri: item.uri }}
              style={styles.image}
              resizeMode="contain"
              onLoadStart={() =>
                setLoadingSet((s) => new Set(s).add(item.id))
              }
              onLoadEnd={() =>
                setLoadingSet((s) => {
                  const next = new Set(s);
                  next.delete(item.id);
                  return next;
                })
              }
              onError={() =>
                setErrorSet((s) => new Set(s).add(item.id))
              }
            />
          )}
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
    },
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
      <View style={styles.backdrop}>
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

        {/* Image carousel */}
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
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

        {/* Page dots (only when ≤ 10 images) */}
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
      </View>
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
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
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
