import { StyleSheet, Text, TextInput, View } from "react-native";

interface DriverVehicleInfoProps {
  vehicleMake: string;
  setVehicleMake: (value: string) => void;
  vehicleModel: string;
  setVehicleModel: (value: string) => void;
  vehicleYear: string;
  setVehicleYear: (value: string) => void;
  vehicleVin: string;
  setVehicleVin: (value: string) => void;
  editing: boolean;
}

export function DriverVehicleInfo({
  vehicleMake,
  setVehicleMake,
  vehicleModel,
  setVehicleModel,
  vehicleYear,
  setVehicleYear,
  vehicleVin,
  setVehicleVin,
  editing,
}: DriverVehicleInfoProps) {
  return (
    <View style={styles.subsection}>
      <Text style={styles.subsectionTitle}>Vehicle</Text>
      <View style={styles.row}>
        <View style={[styles.field, styles.fieldHalf, { marginRight: 6 }]}>
          <Text style={styles.label}>Make</Text>
          <TextInput
            style={[styles.input, !editing && styles.inputDisabled]}
            value={vehicleMake}
            onChangeText={setVehicleMake}
            placeholder="Ford"
            editable={editing}
          />
        </View>
        <View style={[styles.field, styles.fieldHalf, { marginLeft: 6 }]}>
          <Text style={styles.label}>Model</Text>
          <TextInput
            style={[styles.input, !editing && styles.inputDisabled]}
            value={vehicleModel}
            onChangeText={setVehicleModel}
            placeholder="F-150"
            editable={editing}
          />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Year</Text>
        <TextInput
          style={[styles.input, !editing && styles.inputDisabled]}
          value={vehicleYear}
          onChangeText={setVehicleYear}
          placeholder="2024"
          editable={editing}
          keyboardType="number-pad"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>VIN Number</Text>
        <TextInput
          style={[styles.input, !editing && styles.inputDisabled]}
          value={vehicleVin}
          onChangeText={(text) => setVehicleVin(text.toUpperCase())}
          placeholder="1HGBH41JXMN109186"
          editable={editing}
          autoCapitalize="characters"
          maxLength={17}
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
  fieldHalf: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
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
