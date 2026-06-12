import { db } from "@/components/providers/SystemProvider";
import AddressAutocomplete from "./AddressAutoComplete";
import { useAddress } from "@/hooks/db/useAddress";
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

interface EditDriverInfoProps {
  driverId: string | null;
  phoneNumber: string | null;
  addressId: string | null;
  onClose: () => void;
}

export interface AddressData {
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export default function EditDriverInfo({
  driverId,
  phoneNumber,
  addressId,
  onClose,
}: EditDriverInfoProps) {
  const { address } = useAddress(addressId);

  const [phone, setPhone] = useState<string>(phoneNumber ?? "");
  const [addressData, setAddressData] = useState<AddressData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatPhoneInput = (text: string): string => {
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    if (cleaned.length >= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    if (cleaned.length >= 3)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    if (cleaned.length > 0) return `(${cleaned}`;
    return "";
  };

  const formatPhoneNumber = (phone: string | null) => {
    if (!phone) return "Not set";
    // Format as (XXX) XXX-XXXX if 10 digits
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhoneInput(text));
  };

  const handleSubmit = async () => {
    if (!driverId) {
      Alert.alert("Error", "Driver ID not found");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      Alert.alert(
        "Invalid Phone",
        "Please enter a valid 10-digit phone number",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // --- Update phone ---
      const finalPhone = phone.replace(/\D/g, "");
      const phoneToSave =
        finalPhone.length === 10
          ? finalPhone
          : (phoneNumber?.replace(/\D/g, "") ?? null); // fallback to old phone if untouched

      await executeTypedMutation(
        db
          .updateTable("Drivers")
          .set({ phone_number: phoneToSave || null })
          .where("id", "=", driverId)
          .compile(),
      );

      // --- Address ---
      const finalAddress = addressData ?? {
        address: address?.street ?? "",
        city: address?.city ?? "",
        state: address?.state_province ?? "",
        postalCode: address?.zip_postal ?? "",
      };

      const hasAddress =
        finalAddress.address ||
        finalAddress.city ||
        finalAddress.state ||
        finalAddress.postalCode;

      if (hasAddress) {
        if (addressId) {
          await executeTypedMutation(
            db
              .updateTable("Addresses")
              .set({
                street: finalAddress.address || null,
                city: finalAddress.city || null,
                state_province: finalAddress.state || null,
                zip_postal: finalAddress.postalCode || null,
              })
              .where("id", "=", addressId)
              .compile(),
          );
        } else {
          const newAddressId = randomUUID();
          const now = new Date().toISOString();

          await executeTypedMutation(
            db
              .insertInto("Addresses")
              .values({
                id: newAddressId,
                created_at: now,
                street: finalAddress.address || null,
                city: finalAddress.city || null,
                state_province: finalAddress.state || null,
                zip_postal: finalAddress.postalCode || null,
              })
              .compile(),
          );

          await executeTypedMutation(
            db
              .updateTable("Drivers")
              .set({ address_uuid: newAddressId })
              .where("id", "=", driverId)
              .compile(),
          );
        }
      }

      Alert.alert("Success", "Driver information updated successfully!", [
        { text: "OK", onPress: onClose },
      ]);
    } catch (error) {
      console.error("Error updating driver info:", error);
      Alert.alert(
        "Error",
        "Failed to update driver information. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Driver Info</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Phone */}
          <View style={styles.section}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              onChangeText={handlePhoneChange}
              placeholder={formatPhoneNumber(phoneNumber) ?? "(555) 123-4567"} // old phone as placeholder
              placeholderTextColor="#8E8E93"
              keyboardType="phone-pad"
              maxLength={14}
            />
          </View>

          {/* Address */}
          <View style={styles.addressSection}>
            <Text style={styles.sectionTitle}>Address</Text>
            <AddressAutocomplete
              value={addressData?.address ?? ""}
              placeholder={address?.street ?? null}
              onChangeText={(text: string) => {
                setAddressData((prev) => ({
                  address: text,
                  city: prev?.city,
                  state: prev?.state,
                  postalCode: prev?.postalCode,
                }));
              }}
              onAddressSelect={(data) => {
                setAddressData(data); // autocomplete gives structured fields
              }}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.submitButton,
              isSubmitting && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
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
  container: { flex: 1, backgroundColor: "#F2F2F7" },
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
  cancelButton: { fontSize: 16, color: "#0A84FF", fontWeight: "600" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#000" },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  addressSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 12,
  },
  label: { fontSize: 15, fontWeight: "600", color: "#000", marginBottom: 8 },
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
    backgroundColor: "#34C759",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { backgroundColor: "#A8E6B7" },
  submitButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
