import Card from "@/components/ui/Card";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import { ThemeColors, typeScale } from "@/constants/theme";
import {
  expiryStatusLabel,
  getDocExpiryStatus,
} from "@/utils/documentExpiry";
import DevResetDbButton from "@/features/profile/components/DevResetDbButton";
import { DocUploadStatusBanner } from "@/features/profile/components/DocUploadStatusBanner";
import {
  isDocPathReady,
  useDriverDocUploadStatuses,
} from "@/features/profile/hooks/useDriverDocUploadStatuses";
import {
  useAccountManager,
  UserContactData,
} from "@/hooks/db/useAccountManager";
import { AddressData, useAddress } from "@/hooks/db/useAddress";
import { useDriver, useVehicle } from "@/hooks/db/useDriver";
import { useTheme } from "@/hooks/useTheme";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import EditDriverInfo from "./components/EditDriverInfo";
import EditProfileDocs from "./components/EditProfileDocs";
import EditVehicleInfo from "./components/EditVehicleInfo";

import { useThemedStyles } from "@/hooks/useThemedStyles";
export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [showEditDocs, setShowEditDocs] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);
  const [isRetryingDocs, setIsRetryingDocs] = useState(false);

  const { driver } = useDriver();
  const { vehicle } = useVehicle(driver?.vehicle_uuid ?? null);

  const { address } = useAddress(driver?.address_uuid ?? null);
  const { accountManager } = useAccountManager(
    driver?.account_manager_uuid ?? null,
  );
  const country = address?.street?.split(",").pop()?.trim();
  const isUSA = country === "USA";

  const {
    statuses: docStatuses,
    hasPending: docsPending,
    hasFailed: docsFailed,
    retryFailed: retryDocs,
  } = useDriverDocUploadStatuses([
    driver?.license_photo_path,
    driver?.insurance_photo_path,
    driver?.medical_card_photo_path,
  ]);

  const handleRetryDocs = async () => {
    setIsRetryingDocs(true);
    try {
      const { needRepick } = await retryDocs();
      if (needRepick.length > 0) {
        Alert.alert(
          "Re-add required",
          "The local file for some documents is gone. Open Edit Documents and choose the photo again.",
        );
      }
    } finally {
      setIsRetryingDocs(false);
    }
  };

  const docStatusHint = (path: string | null | undefined) => {
    if (!path) return null;
    const status = docStatuses[path];
    if (status === "pending") return "Uploading…";
    if (status === "failed") return "Upload failed";
    return null;
  };

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

  const formatAM = (accountManager: UserContactData | null) => {
    if (!accountManager) return "Not set";
    return `${accountManager?.first_name} ${accountManager?.last_name}`;
  };

  const licenseExpiryStatus = getDocExpiryStatus(driver?.license_expires_on);
  const insuranceExpiryStatus = getDocExpiryStatus(
    driver?.insurance_expires_on,
  );
  const medicalExpiryStatus = getDocExpiryStatus(
    driver?.medical_card_expires_on,
  );

  const expiryHintStyle = (status: ReturnType<typeof getDocExpiryStatus>) => {
    if (status === "expired" || status === "missing")
      return styles.documentExpired;
    if (status === "expiring_soon") return styles.documentExpiring;
    return styles.documentExpiryOk;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ProfileCompletionBanner />
      <DocExpiryWarningBanner />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Image source={{ uri: user?.imageUrl }} style={styles.avatar} />
          <Text style={[styles.name, { color: theme.header }]}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.email}>
            {user?.emailAddresses[0]?.emailAddress}
          </Text>
        </View>

        {/* Edit Documents Modal */}
        {showEditDocs && (
          <EditProfileDocs
            showMedCard={isUSA}
            driverId={driver?.id ?? null}
            licensePath={driver?.license_photo_path ?? null}
            insurancePath={driver?.insurance_photo_path ?? null}
            medicalCardPath={driver?.medical_card_photo_path ?? null}
            licenseExpiresOn={driver?.license_expires_on ?? null}
            insuranceExpiresOn={driver?.insurance_expires_on ?? null}
            medicalCardExpiresOn={driver?.medical_card_expires_on ?? null}
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
          <Card style={styles.sectionSpacing}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Driver Information</Text>
              <View style={styles.sectionRight}>
                {driver?.phone_number && driver?.address_uuid && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setShowEditDriver(true)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone Number</Text>
              <Text style={styles.infoValue}>
                {formatPhoneNumber(driver.phone_number)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>
                {address?.street?.split(",")[0]?.trim() ?? ""}
              </Text>
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
          </Card>
        )}

        {/* Vehicle Info Section */}
        {driver && driver.phone_number && driver.address_uuid && (
          <Card style={styles.sectionSpacing}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Vehicle Information</Text>
              <View style={styles.sectionRight}>
                {vehicle?.id &&
                  vehicle?.make &&
                  vehicle?.model &&
                  vehicle?.year &&
                  vehicle?.vin_number && (
                    <View style={styles.documentBadge}>
                      <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
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
                {vehicle?.make && vehicle?.model
                  ? `${vehicle.make} ${vehicle.model}`
                  : "Not set"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Year</Text>
              <Text style={styles.infoValue}>{vehicle?.year ?? "Not set"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>VIN</Text>
              <Text style={styles.infoValue}>
                {vehicle?.vin_number ?? "Not set"}
              </Text>
            </View>
          </Card>
        )}

        {/* Documents Section */}
        {vehicle && country && (
          <Card style={styles.sectionSpacing}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Documents</Text>
              <View style={styles.sectionRight}>
                {driver?.insurance_photo_path &&
                  driver?.license_photo_path &&
                  driver?.license_expires_on &&
                  driver?.insurance_expires_on &&
                  licenseExpiryStatus === "ok" &&
                  insuranceExpiryStatus === "ok" &&
                  ((isUSA &&
                    driver?.medical_card_photo_path &&
                    driver?.medical_card_expires_on &&
                    medicalExpiryStatus === "ok") ||
                    !isUSA) &&
                  isDocPathReady(docStatuses[driver.license_photo_path]) &&
                  isDocPathReady(docStatuses[driver.insurance_photo_path]) &&
                  (!isUSA ||
                    isDocPathReady(
                      docStatuses[driver.medical_card_photo_path!],
                    )) && (
                    <View style={styles.documentBadge}>
                      <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
                    </View>
                  )}
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setShowEditDocs(true)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <DocUploadStatusBanner
              hasPending={docsPending}
              hasFailed={docsFailed}
              isRetrying={isRetryingDocs}
              onRetry={handleRetryDocs}
            />

            <View style={styles.documentRow}>
              <View style={styles.documentIconContainer}>
                <Ionicons name="card" size={20} color={theme.accent} />
              </View>
              <View style={styles.documentContent}>
                <Text style={styles.documentText}>Driver&apos;s License</Text>
                {!driver?.license_photo_path && (
                  <Text style={styles.documentMissing}>Not uploaded</Text>
                )}
                {docStatusHint(driver?.license_photo_path) && (
                  <Text style={styles.documentPending}>
                    {docStatusHint(driver?.license_photo_path)}
                  </Text>
                )}
                <Text style={expiryHintStyle(licenseExpiryStatus)}>
                  {expiryStatusLabel(
                    licenseExpiryStatus,
                    driver?.license_expires_on,
                  )}
                </Text>
              </View>
              {driver?.license_photo_path &&
                licenseExpiryStatus === "ok" &&
                isDocPathReady(docStatuses[driver.license_photo_path]) && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
                  </View>
                )}
            </View>

            <View style={styles.documentRow}>
              <View style={styles.documentIconContainer}>
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={theme.accent}
                />
              </View>
              <View style={styles.documentContent}>
                <Text style={styles.documentText}>
                  Certificate of Insurance
                </Text>
                {!driver?.insurance_photo_path && (
                  <Text style={styles.documentMissing}>Not uploaded</Text>
                )}
                {docStatusHint(driver?.insurance_photo_path) && (
                  <Text style={styles.documentPending}>
                    {docStatusHint(driver?.insurance_photo_path)}
                  </Text>
                )}
                <Text style={expiryHintStyle(insuranceExpiryStatus)}>
                  {expiryStatusLabel(
                    insuranceExpiryStatus,
                    driver?.insurance_expires_on,
                  )}
                </Text>
              </View>
              {driver?.insurance_photo_path &&
                insuranceExpiryStatus === "ok" &&
                isDocPathReady(docStatuses[driver.insurance_photo_path]) && (
                  <View style={styles.documentBadge}>
                    <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
                  </View>
                )}
            </View>
            {isUSA && (
              <View style={styles.documentRow}>
                <View style={styles.documentIconContainer}>
                  <Ionicons name="medical" size={20} color={theme.accent} />
                </View>
                <View style={styles.documentContent}>
                  <Text style={styles.documentText}>Medical Card</Text>
                  {!driver?.medical_card_photo_path && (
                    <Text style={styles.documentMissing}>Not uploaded</Text>
                  )}
                  {docStatusHint(driver?.medical_card_photo_path) && (
                    <Text style={styles.documentPending}>
                      {docStatusHint(driver?.medical_card_photo_path)}
                    </Text>
                  )}
                  <Text style={expiryHintStyle(medicalExpiryStatus)}>
                    {expiryStatusLabel(
                      medicalExpiryStatus,
                      driver?.medical_card_expires_on,
                    )}
                  </Text>
                </View>
                {driver?.medical_card_photo_path &&
                  medicalExpiryStatus === "ok" &&
                  isDocPathReady(
                    docStatuses[driver.medical_card_photo_path],
                  ) && (
                    <View style={styles.documentBadge}>
                      <Ionicons name="checkmark" size={16} color={theme.onSecondaryAccent} />
                    </View>
                  )}
              </View>
            )}
          </Card>
        )}

        {/* DEV-only: reset local DB to reproduce a fresh first-sync */}
        {__DEV__ && <DevResetDbButton />}

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={onLogout}
          activeOpacity={0.7}
        >
          <LogOut
            size={16}
            color={theme.accent}
            strokeWidth={2}
          />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    header: {
      alignItems: "center",
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: "transparent",
      marginHorizontal: -16,
      paddingHorizontal: 16,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 60,
      marginBottom: 16,
      borderWidth: 4,
      borderColor: theme.separator,
    },
    name: {
      ...typeScale.title2,
      fontWeight: "700",
      marginBottom: 4,
    },
    email: {
      ...typeScale.subhead,
      color: theme.textSecondary,
    },
    sectionSpacing: {
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
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
      letterSpacing: 0.3,
    },
    editButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.accent,
      borderRadius: 6,
    },
    editButtonText: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.onAccent,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    infoLabel: {
      ...typeScale.subhead,
      color: theme.textSecondary,
      fontWeight: "400",
    },
    infoValue: {
      ...typeScale.footnote,
      color: theme.textPrimary,
      fontWeight: "600",
    },
    infoViewOnlyValue: {
      ...typeScale.footnote,
      color: theme.textSecondary,
      fontWeight: "600",
    },
    documentRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
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
      ...typeScale.subhead,
      color: theme.textPrimary,
      fontWeight: "400",
    },
    documentMissing: {
      ...typeScale.footnote,
      color: theme.danger,
      fontWeight: "400",
      marginTop: 2,
    },
    documentPending: {
      ...typeScale.footnote,
      color: theme.warning,
      fontWeight: "400",
      marginTop: 2,
    },
    documentExpired: {
      ...typeScale.footnote,
      color: theme.danger,
      fontWeight: "400",
      marginTop: 2,
    },
    documentExpiring: {
      ...typeScale.footnote,
      color: theme.warning,
      fontWeight: "400",
      marginTop: 2,
    },
    documentExpiryOk: {
      ...typeScale.footnote,
      color: theme.textTertiary,
      fontWeight: "400",
      marginTop: 2,
    },
    documentBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.secondaryAccent,
      alignItems: "center",
      justifyContent: "center",
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      marginTop: 8,
      marginBottom: 36,
    },
    logoutButtonText: {
      color: theme.textSecondary,
      fontWeight: "400",
      ...typeScale.callout,
    },
  });
}
