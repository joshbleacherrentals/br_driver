import { useTheme } from "@/hooks/useTheme";
import { typeScale } from "@/constants/theme";
import React, { useEffect, useMemo, useRef } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDate(year: number, monthIndex: number, day: number): Date {
  const maxDay = daysInMonth(year, monthIndex);
  return new Date(year, monthIndex, Math.min(day, maxDay));
}

type WheelColumnProps = {
  data: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  textColor: string;
};

function WheelColumn({
  data,
  selectedIndex,
  onSelect,
  textColor,
}: WheelColumnProps) {
  const ref = useRef<ScrollView>(null);
  const padding = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      ref.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedIndex, data.length]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    onSelect(clamped);
    ref.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={styles.wheelColumn}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ paddingVertical: padding }}
      >
        {data.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.wheelItem}>
            <Text
              style={[
                styles.wheelItemText,
                {
                  color: textColor,
                  opacity: index === selectedIndex ? 1 : 0.35,
                  fontWeight: index === selectedIndex ? "600" : "400",
                },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

type AndroidWheelDatePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  textColor: string;
};

/** iOS-like scroll wheels for Android (native spinner is always a system dialog). */
export function AndroidWheelDatePicker({
  value,
  onChange,
  textColor,
}: AndroidWheelDatePickerProps) {
  const { theme } = useTheme();
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 41 }, (_, i) => String(currentYear - 10 + i)),
    [currentYear],
  );
  const yearIndex = Math.max(0, years.indexOf(String(value.getFullYear())));
  const monthIndex = value.getMonth();
  const dayCount = daysInMonth(value.getFullYear(), monthIndex);
  const days = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) =>
        String(i + 1).padStart(2, "0"),
      ),
    [dayCount],
  );
  const dayIndex = Math.min(value.getDate(), dayCount) - 1;

  return (
    <View style={styles.wheelRow}>
      <View
        pointerEvents="none"
        style={[styles.wheelHighlight, { borderColor: theme.separator }]}
      />
      <WheelColumn
        data={MONTHS}
        selectedIndex={monthIndex}
        textColor={textColor}
        onSelect={(index) =>
          onChange(clampDate(value.getFullYear(), index, value.getDate()))
        }
      />
      <WheelColumn
        data={days}
        selectedIndex={dayIndex}
        textColor={textColor}
        onSelect={(index) =>
          onChange(clampDate(value.getFullYear(), monthIndex, index + 1))
        }
      />
      <WheelColumn
        data={years}
        selectedIndex={yearIndex}
        textColor={textColor}
        onSelect={(index) =>
          onChange(
            clampDate(Number(years[index]), monthIndex, value.getDate()),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wheelRow: {
    height: PICKER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wheelHighlight: {
    position: "absolute",
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  wheelColumn: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    ...typeScale.title3,
  },
});
