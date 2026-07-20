import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useCallback, useEffect } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
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
import { SafeAreaView } from "react-native-safe-area-context";

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const BG = "#F2F2F7";
const SCREEN_H = Dimensions.get("window").height;
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 800;

export default function BottomSheetModal({
  visible,
  onClose,
  children,
}: BottomSheetModalProps) {
  const colorScheme = useColorScheme();
  const bg = colorScheme === "dark" ? "#1C1C1E" : BG;

  // iOS: native pageSheet already supports drag-to-dismiss.
  if (Platform.OS === "ios") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
          <View style={styles.dragHandleBar}>
            <View style={styles.dragHandle} />
          </View>
          <View style={styles.content}>{children}</View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <AndroidSheet visible={visible} onClose={onClose} backgroundColor={bg}>
      {children}
    </AndroidSheet>
  );
}

function AndroidSheet({
  visible,
  onClose,
  backgroundColor,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  backgroundColor: string;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(SCREEN_H);
  const backdrop = useSharedValue(0);

  const animateOpen = useCallback(() => {
    translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
    backdrop.value = withTiming(1, { duration: 200 });
  }, [backdrop, translateY]);

  const animateClose = useCallback(
    (then?: () => void) => {
      translateY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
        if (finished && then) runOnJS(then)();
      });
      backdrop.value = withTiming(0, { duration: 200 });
    },
    [backdrop, translateY],
  );

  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_H;
      animateOpen();
    }
  }, [visible, animateOpen, translateY]);

  const requestClose = useCallback(() => {
    animateClose(onClose);
  }, [animateClose, onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_H,
          { duration: 200 },
          (finished) => {
            if (finished) runOnJS(onClose)();
          },
        );
        backdrop.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    });

  const tapHandle = Gesture.Tap().onEnd(() => {
    runOnJS(requestClose)();
  });

  const handleGesture = Gesture.Exclusive(pan, tapHandle);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.45,
  }));

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      {/* Modal is a separate native root — needs its own GestureHandlerRootView */}
      <GestureHandlerRootView style={styles.androidRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>

        <Animated.View
          style={[styles.androidSheet, { backgroundColor }, sheetStyle]}
        >
          <GestureDetector gesture={handleGesture}>
            <Animated.View style={styles.dragHandleBar}>
              <View style={styles.dragHandle} />
            </Animated.View>
          </GestureDetector>

          <SafeAreaView style={styles.content} edges={["bottom"]}>
            {children}
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  dragHandleBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 14,
    minHeight: 48,
    width: "100%",
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(120,120,128,0.55)",
  },
  content: { flex: 1 },
  androidRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  androidSheet: {
    height: "92%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
});
