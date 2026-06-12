import { db } from "@/components/providers/SystemProvider";
import { BRAND_BLUE, GREEN_ACCENT } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { randomUUID } from "expo-crypto";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface EditVehicleInfoProps {
  driverId: string | null;
  vehicleId: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vinNumber: string | null;
  onClose: () => void;
}

export default function EditVehicleInfo({
  driverId,
  vehicleId,
  make,
  model,
  year,
  vinNumber,
  onClose,
}: EditVehicleInfoProps) {
  const [vehicleMake, setVehicleMake] = useState(make ?? "");
  const [vehicleModel, setVehicleModel] = useState(model ?? "");
  const [vehicleYear, setVehicleYear] = useState(year?.toString() ?? "");
  const [vehicleVin, setVehicleVin] = useState(vinNumber ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDark = useColorScheme() === "dark";
  const theme = {
    bg: isDark ? "#000000" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    border: isDark ? "rgba(255,255,255,0.1)" : "#E5E7EB",
    text: isDark ? "#FFFFFF" : "#000000",
    inputBg: isDark ? "#2C2C2E" : "#F8F8F8",
  };

  const isInsert = !vehicleId;

  const validate = (): number | null => {
    const trimmedMake = vehicleMake.trim();
    const trimmedModel = vehicleModel.trim();
    const trimmedVin = vehicleVin.trim();
    const yearNum = vehicleYear ? parseInt(vehicleYear, 10) : null;

    if (isInsert) {
      if (!trimmedMake || !trimmedModel || !vehicleYear || !trimmedVin) {
        Alert.alert("Missing Fields", "Please fill out all vehicle fields.");
        return null;
      }
    }

    if (vehicleYear) {
      if (
        isNaN(yearNum!) ||
        yearNum! < 1900 ||
        yearNum! > new Date().getFullYear() + 1
      ) {
        Alert.alert("Invalid Year", "Please enter a valid vehicle year.");
        return null;
      }
    }

    if (trimmedVin && trimmedVin.length !== 17) {
      Alert.alert("Invalid VIN", "VIN must be exactly 17 characters.");
      return null;
    }

    return yearNum;
  };

  const handleSubmit = async () => {
    const yearNum = validate();
    if (yearNum === null && vehicleYear !== "") return;

    setIsSubmitting(true);

    try {
      if (!vehicleId) {
        const id = randomUUID();

        console.log(vehicleMake);
        console.log(vehicleModel);
        console.log(vehicleVin);
        console.log(vehicleYear);

        const insertVehicleQuery = db
          .insertInto("Vehicles")
          .values({
            id,
            created_at: new Date().toISOString(),
            make: vehicleMake.trim(),
            model: vehicleModel.trim(),
            year: yearNum,
            vin_number: vehicleVin.trim(),
          })
          .compile();

        await executeTypedMutation(insertVehicleQuery);

        const linkQuery = db
          .updateTable("Drivers")
          .set({ vehicle_uuid: id })
          .where("id", "=", driverId)
          .compile();

        await executeTypedMutation(linkQuery);

        Alert.alert("Success", "Vehicle added successfully!", [
          { text: "OK", onPress: onClose },
        ]);
        return;
      }

      // ---- Update existing ----
      const updateQuery = db
        .updateTable("Vehicles")
        .set({
          make: vehicleMake.trim() || null,
          model: vehicleModel.trim() || null,
          year: yearNum,
          vin_number: vehicleVin.trim() || null,
        })
        .where("id", "=", vehicleId)
        .compile();

      await executeTypedMutation(updateQuery);

      Alert.alert("Success", "Vehicle information updated successfully!", [
        { text: "OK", onPress: onClose },
      ]);
    } catch (error) {
      console.error("Error saving vehicle:", error);
      Alert.alert("Error", "Failed to save vehicle information.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled =
    isSubmitting ||
    (isInsert &&
      (!vehicleMake.trim() ||
        !vehicleModel.trim() ||
        !vehicleYear ||
        !vehicleVin.trim()));

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: theme.card, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Edit Vehicle Info
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>Make</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              onChangeText={setVehicleMake}
              placeholder={vehicleMake ? vehicleMake : "e.g., Ford"}
              placeholderTextColor="#8E8E93"
            />
          </View>

          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>Model</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              onChangeText={setVehicleModel}
              placeholder={vehicleModel ? vehicleModel : "e.g., F-150"}
              placeholderTextColor="#8E8E93"
            />
          </View>

          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>Year</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              onChangeText={setVehicleYear}
              placeholder={vehicleYear ? vehicleYear : "e.g., 2020"}
              placeholderTextColor="#8E8E93"
              keyboardType="numeric"
              maxLength={4}
            />
          </View>

          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>
              VIN Number
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              onChangeText={setVehicleVin}
              placeholder={vehicleVin ? vehicleVin : "17-character VIN"}
              placeholderTextColor="#8E8E93"
              autoCapitalize="characters"
              maxLength={17}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.submitButton,
              submitDisabled && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitDisabled}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cancelButton: {
    fontSize: 16,
    color: BRAND_BLUE,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  submitButton: {
    backgroundColor: GREEN_ACCENT,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#A8E6B7",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
