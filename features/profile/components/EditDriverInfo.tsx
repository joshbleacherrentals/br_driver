import { db } from "@/components/providers/SystemProvider";
import { typeScale } from "@/constants/theme";
import { useAddress } from "@/hooks/db/useAddress";
import { useFormTheme } from "@/hooks/useTheme";
import { addressFieldsFor } from "@/utils/addressWrite";
import { formatAddress } from "@/utils/formatAddress";
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
import AddressAutocomplete, { type AddressData } from "./AddressAutoComplete";

interface EditDriverInfoProps {
  driverId: string | null;
  phoneNumber: string | null;
  addressId: string | null;
  onClose: () => void;
}

export default function EditDriverInfo({
  driverId,
  phoneNumber,
  addressId,
  onClose,
}: EditDriverInfoProps) {
  const { address } = useAddress(addressId);

  const [phone, setPhone] = useState<string>(phoneNumber ?? "");
  // What the field shows, and — separately — the place the driver actually
  // picked off the dropdown. Only a pick carries a city, a country and a
  // geocode; text typed over it is a street line and nothing more, so
  // retyping has to drop the pick rather than leave a stale geocode attached
  // to an address it no longer describes.
  const [addressText, setAddressText] = useState<string>("");
  const [picked, setPicked] = useState<AddressData | null>(null);
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
      // Null means the driver never touched it — see addressFieldsFor for why
      // a picked place and typed text write different sets of columns.
      const addressFields = addressFieldsFor(picked, addressText);

      if (addressFields) {
        if (addressId) {
          await executeTypedMutation(
            db
              .updateTable("Addresses")
              .set(addressFields)
              .where("id", "=", addressId)
              .compile(),
          );
        } else {
          const newAddressId = randomUUID();

          await executeTypedMutation(
            db
              .insertInto("Addresses")
              .values({
                id: newAddressId,
                created_at: new Date().toISOString(),
                ...addressFields,
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
              value={addressText}
              placeholder={formatAddress(address) ?? null}
              onChangeText={(text: string) => {
                setAddressText(text);
                setPicked(null);
              }}
              onAddressSelect={(data) => {
                // The field keeps showing Google's full one-line address; only
                // `street` is narrowed to the street line.
                setAddressText(data.formatted ?? data.address);
                setPicked(data);
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
              style={[
                styles.submitButtonText,
                { color: theme.onSecondaryAccent },
              ]}
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
