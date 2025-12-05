import { StyleSheet, Text, TextInput, View } from "react-native";

interface DriverContactInfoProps {
  phoneNumber: string;
  setPhoneNumber: (value: string) => void;
  editing: boolean;
}

export function DriverContactInfo({
  phoneNumber,
  setPhoneNumber,
  editing,
}: DriverContactInfoProps) {
  return (
    <View style={styles.subsection}>
      <Text style={styles.subsectionTitle}>Contact</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={[styles.input, !editing && styles.inputDisabled]}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="(555) 123-4567"
          editable={editing}
          keyboardType="phone-pad"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subsection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#1E293B",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
});
