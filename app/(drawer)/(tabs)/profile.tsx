import EditDriverInfo from "@/components/widgets/editDriverInfo";
import EditProfileDocs from "@/components/widgets/editProfileDocs";
import EditVehicleInfo from "@/components/widgets/editVehicleInfo";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import { useAccountManager, UserContactData } from "@/hooks/db/useAccountManager";
import { AddressData, useAddress } from "@/hooks/db/useAddress";
import { useDriver, useVehicle } from "@/hooks/db/useDriver";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const DARK_BLUE = "#10365A";

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [showEditDocs, setShowEditDocs] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);

  const { driver } = useDriver();
  const { vehicle } = useVehicle(driver?.vehicle_uuid ?? null);

  const { address } = useAddress(driver?.address_uuid ?? null);
  const { accountManager } = useAccountManager(driver?.account_manager_uuid ?? null);
  const country = address?.street?.split(",").pop()?.trim();
  const isUSA = country === "USA";

  const formatAddress = (address: AddressData | null) => {
    if (!address) return "Address not set";

    return `${address.street}, ${address.city}, ${address.state_province}`;
  };

  const onLogout = async () => {
    Alert.alert(
      "Are you sure?",
      "You will not be able to log back in without internet connection",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          },
        },
      ],
    );
  };

  const formatPayRate = (cents: number | null) => {
    if (cents === null) return "Not set";
    return `$${(cents / 100).toFixed(2)}`;
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

  const formatAM = (accountManager : UserContactData | null) => {
    if (!accountManager) return 'Not set';
    return `${accountManager?.first_name} ${accountManager?.last_name}`;
  };

  return (
    <View style={styles.container}>
      <ProfileCompletionBanner />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Image source={{ uri: user?.imageUrl }} style={styles.avatar} />
          <Text style={styles.name}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.email}>{user?.emailAddresses[0]?.emailAddress}</Text>
        </View>

        {/* Edit Documents Modal */}
        {showEditDocs && (
          <EditProfileDocs
            showMedCard={isUSA}
            driverId={driver?.id ?? null}
            licensePath={driver?.license_photo_path ?? null}
            insurancePath={driver?.insurance_photo_path ?? null}
            medicalCardPath={driver?.medical_card_photo_path ?? null}
            onClose={() => setShowEditDocs(false)}
          />
        )}

        {/* Edit Vehicles Info Modal */}
        {showEditVehicle && (
          <EditVehicleInfo
            driverId={driver?.id ?? null}
            vehicleId={vehicle?.id ?? null}
            make={vehicle?.make ?? null}
            model={vehicle?.model ?? null}
            year={vehicle?.year ?? null}
            vinNumber={vehicle?.vin_number ?? null}
            onClose={() => setShowEditVehicle(false)}
          />
        )}

        {/* Edit Driver Info Modal*/}
        {showEditDriver && (
          <EditDriverInfo
            driverId={driver?.id ?? null}
            phoneNumber={driver?.phone_number ?? null}
            addressId={driver?.address_uuid ?? null}
            onClose={() => setShowEditDriver(false)}
          />
        )}

        {/* Driver Info Section */}
        {driver && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Driver Information</Text>
              <View style={styles.sectionRight}>
                {driver?.phone_number && driver?.address_uuid && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
                <TouchableOpacity style={styles.editButton} onPress={() => setShowEditDriver(true)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone Number</Text>
              <Text style={styles.infoValue}>{formatPhoneNumber(driver.phone_number)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{address?.street?.split(",")[0]?.trim() ?? ""}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Manager</Text>
              <Text style={styles.infoViewOnlyValue}>
                {formatAM(accountManager)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pay Rate</Text>
              <Text style={styles.infoViewOnlyValue}>
                {formatPayRate(driver.pay_rate_cents)}
                {driver.pay_per_unit && ` per ${driver.pay_per_unit}`}
              </Text>
            </View>

            {driver.tax !== null && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tax Rate</Text>
                <Text style={styles.infoViewOnlyValue}>{driver.tax}%</Text>
              </View>
            )}
          </View>
        )}

        {/* Vehicle Info Section */}
        { driver && driver.phone_number && driver.address_uuid && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Vehicle Information</Text>
              <View style={styles.sectionRight}>
                {vehicle?.id && vehicle?.make && vehicle?.model && vehicle?.year && vehicle?.vin_number && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
                <TouchableOpacity 
                  style={styles.editButton}
                  onPress={() => setShowEditVehicle(true)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Make & Model</Text>
              <Text style={styles.infoValue}>
                {vehicle?.make && vehicle?.model ? `${vehicle.make} ${vehicle.model}` : 'Not set'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Year</Text>
              <Text style={styles.infoValue}>{vehicle?.year ?? 'Not set'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>VIN</Text>
              <Text style={styles.infoValue}>{vehicle?.vin_number ?? 'Not set'}</Text>
            </View>
          </View>
        )}

        {/* Documents Section */}
        { vehicle && country && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Documents</Text>
              <View style={styles.sectionRight}>
                {driver?.insurance_photo_path && driver?.license_photo_path && (( isUSA && driver?.medical_card_photo_path) || (!isUSA)) && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
                <TouchableOpacity 
                  style={styles.editButton}
                  onPress={() => setShowEditDocs(true)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.documentRow}>
              <View style={styles.documentIconContainer}>
                <Ionicons name="card" size={20} color="#0A84FF" />
              </View>
              <View style={styles.documentContent}>
                <Text style={styles.documentText}>Driver&apos;s License</Text>
                {!driver?.license_photo_path && (
                  <Text style={styles.documentMissing}>Not uploaded</Text>
                )}
              </View>
              {driver?.license_photo_path && (
                <View style={styles.documentBadge}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>

            <View style={styles.documentRow}>
              <View style={styles.documentIconContainer}>
                <Ionicons name="shield-checkmark" size={20} color="#0A84FF" />
              </View>
              <View style={styles.documentContent}>
                <Text style={styles.documentText}>Certificate of Insurance</Text>
                {!driver?.insurance_photo_path && (
                  <Text style={styles.documentMissing}>Not uploaded</Text>
                )}
              </View>
              {driver?.insurance_photo_path && (
                <View style={styles.documentBadge}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
            { isUSA && (
              <View style={styles.documentRow}>
                <View style={styles.documentIconContainer}>
                  <Ionicons name="medical" size={20} color="#0A84FF" />
                </View>
                <View style={styles.documentContent}>
                  <Text style={styles.documentText}>Medical Card</Text>
                  {!driver?.medical_card_photo_path && (
                    <Text style={styles.documentMissing}>Not uploaded</Text>
                  )}
                </View>
                {driver?.medical_card_photo_path && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BLUE,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: DARK_BLUE,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 60,
    marginBottom: 16,
    borderWidth: 4,
    borderColor: "#F2F2F7",
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  email: {
    fontSize: 15,
    color: "#8E8E93",
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    letterSpacing: 0.3,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0A84FF",
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  infoLabel: {
    fontSize: 15,
    color: "#8E8E93",
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    color: "#000",
    fontWeight: "600",
  },
  infoViewOnlyValue: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  documentIconContainer: {
    width: 20,
    height: 20,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  documentContent: {
    flex: 1,
  },
  documentText: {
    fontSize: 15,
    color: "#000",
    fontWeight: "500",
  },
  documentMissing: {
    fontSize: 13,
    color: "#FF3B30",
    fontWeight: "500",
    marginTop: 2,
  },
  documentBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#34C759",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 36,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
});
