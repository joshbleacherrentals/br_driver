import { db } from "@/components/providers/SystemProvider";
import { typeScale } from "@/constants/theme";
import { useAddress } from "@/hooks/db/useAddress";
import { useFormTheme } from "@/hooks/useTheme";
import { formatPhoneNumber } from "@/utils/phone";
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
import AddressAutocomplete from "./AddressAutoComplete";

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

  const { form: theme } = useFormTheme();

  const formatPhoneInput = (text: string): string => {
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    if (cleaned.length >= 6)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    if (cleaned.length >= 3)
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    if (cleaned.length > 0) return `(${cleaned}`;
    return "";
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
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: theme.card, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancelButton, { color: theme.accent }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Edit Driver Info
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Phone */}
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>
              Phone Number
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
              onChangeText={handlePhoneChange}
              placeholder={formatPhoneNumber(phoneNumber) ?? "(555) 123-4567"} // old phone as placeholder
              placeholderTextColor={theme.placeholder}
              keyboardType="phone-pad"
              maxLength={14}
            />
          </View>

          {/* Address */}
          <View
            style={[styles.addressSection, { backgroundColor: theme.card }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Address
            </Text>
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
              { backgroundColor: theme.secondaryAccent },
              isSubmitting && { backgroundColor: theme.secondaryAccent + "66" },
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text
              style={[styles.submitButtonText, { color: theme.onSecondaryAccent }]}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  cancelButton: { ...typeScale.callout, fontWeight: "600" },
  headerTitle: { ...typeScale.title3, fontWeight: "700" },
  scrollContent: { padding: 16 },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  addressSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    ...typeScale.callout,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: { ...typeScale.subhead, fontWeight: "600", marginBottom: 8 },
  input: {
    borderRadius: 8,
    padding: 12,
    ...typeScale.callout,
    borderWidth: 1,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: { ...typeScale.callout, fontWeight: "600" },
});
