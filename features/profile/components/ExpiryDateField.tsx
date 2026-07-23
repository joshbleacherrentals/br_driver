import { BRAND_BLUE } from "@/constants/Colors";
import { AndroidWheelDatePicker } from "@/features/profile/components/AndroidWheelDatePicker";
import { formatExpiryDate, todayISODate } from "@/utils/documentExpiry";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ExpiryDateFieldProps = {
  label?: string;
  value: string | null;
  onChange: (date: string | null) => void;
  theme: {
    text: string;
    inputBg: string;
    border: string;
    card: string;
  };
};

function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ExpiryDateField({
  label = "Expiration date",
  value,
  onChange,
  theme,
}: ExpiryDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() =>
    value ? parseISODate(value) : parseISODate(todayISODate()),
  );

  useEffect(() => {
    if (open) {
      setDraft(value ? parseISODate(value) : parseISODate(todayISODate()));
    }
  }, [open, value]);

  const handleIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) setDraft(selected);
  };

  const handleDone = () => {
    onChange(toISODate(draft));
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.field,
          { backgroundColor: theme.inputBg, borderColor: theme.border },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color={BRAND_BLUE} />
        <Text
          style={[
            styles.fieldText,
            { color: value ? theme.text : "#8E8E93" },
          ]}
        >
          {value ? formatExpiryDate(value) : "Select expiration date"}
        </Text>
        {value ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Clear expiration date"
          >
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropTap}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {label}
              </Text>
              <TouchableOpacity onPress={handleDone}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>

            {Platform.OS === "ios" ? (
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                onChange={handleIosChange}
                style={styles.picker}
              />
            ) : (
              <AndroidWheelDatePicker
                value={draft}
                onChange={setDraft}
                textColor={theme.text}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(60,60,67,0.29)",
  },
  cancelText: {
    fontSize: 16,
    color: BRAND_BLUE,
    fontWeight: "400",
  },
  doneText: {
    fontSize: 16,
    color: BRAND_BLUE,
    fontWeight: "600",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  picker: {
    alignSelf: "stretch",
    height: 216,
  },
});
