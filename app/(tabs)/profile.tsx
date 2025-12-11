import { DriverAddressInfo } from "@/components/profile/DriverAddressInfo";
import { DriverContactInfo } from "@/components/profile/DriverContactInfo";
import { DriverDocuments } from "@/components/profile/DriverDocuments";
import { DriverVehicleInfo } from "@/components/profile/DriverVehicleInfo";
import { PRIMARY } from "@/constants/AuthStyles";
import {
  getDriverProfile,
  updateDriverProfile,
  upsertAddress,
  upsertVehicle,
} from "@/db/online/driverProfile";
import { DriverWithDetails } from "@/types/driver";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [zipPostal, setZipPostal] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleVin, setVehicleVin] = useState("");
  const [licensePhotoPath, setLicensePhotoPath] = useState<string | null>(null);
  const [insurancePhotoPath, setInsurancePhotoPath] = useState<string | null>(null);
  const [medicalCardPhotoPath, setMedicalCardPhotoPath] = useState<string | null>(null);

  // use effect console log user
  useEffect(() => {
    console.log("Clerk user data:", user);
  }, [user]);

  // Fetch driver profile
  const { data: driverProfile, isLoading } = useQuery<DriverWithDetails | null>({
    queryKey: ["driverProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return await getDriverProfile(supabase, user.id);
    },
    enabled: !!user?.id,
  });

  // Initialize form when data loads
  useEffect(() => {
    if (driverProfile && !editing) {
      setPhoneNumber(driverProfile.phone_number || "");
      setStreet(driverProfile.address?.street || "");
      setCity(driverProfile.address?.city || "");
      setStateProvince(driverProfile.address?.state_province || "");
      setZipPostal(driverProfile.address?.zip_postal || "");
      setVehicleMake(driverProfile.vehicle?.make || "");
      setVehicleModel(driverProfile.vehicle?.model || "");
      setVehicleYear(driverProfile.vehicle?.year?.toString() || "");
      setVehicleVin(driverProfile.vehicle?.vin_number || "");
      setLicensePhotoPath(driverProfile.license_photo_path);
      setInsurancePhotoPath(driverProfile.insurance_photo_path);
      setMedicalCardPhotoPath(driverProfile.medical_card_photo_path);
    }
  }, [driverProfile, editing]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!driverProfile) throw new Error("No driver profile found");

      const updates: any = {
        phone_number: phoneNumber || null,
        license_photo_path: licensePhotoPath,
        insurance_photo_path: insurancePhotoPath,
        medical_card_photo_path: medicalCardPhotoPath,
      };

      // Update or create address
      if (street && city && stateProvince) {
        const addressId = await upsertAddress(supabase, {
          address_id: driverProfile.address_id || undefined,
          street,
          city,
          state_province: stateProvince,
          zip_postal: zipPostal || null,
        });
        updates.address_id = addressId;
      }

      // Update or create vehicle
      if (vehicleMake && vehicleModel && vehicleYear) {
        const vehicleId = await upsertVehicle(supabase, {
          vehicle_id: driverProfile.vehicle_id || undefined,
          make: vehicleMake,
          model: vehicleModel,
          year: parseInt(vehicleYear),
          vin_number: vehicleVin || null,
        });
        updates.vehicle_id = vehicleId;
      }

      await updateDriverProfile(supabase, driverProfile.driver_id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driverProfile"] });
      setEditing(false);
      Alert.alert("Success", "Profile updated successfully");
    },
    onError: (error) => {
      console.error("Update error:", error);
      Alert.alert("Error", "Failed to update profile");
    },
  });

  const onLogout = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Image source={{ uri: user?.imageUrl }} style={styles.avatar} />
          <Text style={styles.name}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.email}>{user?.emailAddresses[0]?.emailAddress}</Text>
        </View>

        {/* Driver Information Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Driver Information</Text>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.editButton}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Contact Information */}
          <DriverContactInfo
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            editing={editing}
          />

          {/* Address Information */}
          <DriverAddressInfo
            street={street}
            setStreet={setStreet}
            city={city}
            setCity={setCity}
            stateProvince={stateProvince}
            setStateProvince={setStateProvince}
            zipPostal={zipPostal}
            setZipPostal={setZipPostal}
            editing={editing}
          />

          {/* Vehicle Information */}
          <DriverVehicleInfo
            vehicleMake={vehicleMake}
            setVehicleMake={setVehicleMake}
            vehicleModel={vehicleModel}
            setVehicleModel={setVehicleModel}
            vehicleYear={vehicleYear}
            setVehicleYear={setVehicleYear}
            vehicleVin={vehicleVin}
            setVehicleVin={setVehicleVin}
            editing={editing}
          />

          {/* Documents */}
          {driverProfile?.driver_id && (
            <DriverDocuments
              licensePhotoPath={licensePhotoPath}
              setLicensePhotoPath={setLicensePhotoPath}
              insurancePhotoPath={insurancePhotoPath}
              setInsurancePhotoPath={setInsurancePhotoPath}
              medicalCardPhotoPath={medicalCardPhotoPath}
              setMedicalCardPhotoPath={setMedicalCardPhotoPath}
              driverId={driverProfile.driver_id}
              supabase={supabase}
              onDocumentUpdate={async (field, path) => {
                if (!driverProfile) return;
                await updateDriverProfile(supabase, driverProfile.driver_id, {
                  [field]: path,
                });
                queryClient.invalidateQueries({ queryKey: ["driverProfile"] });
              }}
            />
          )}

          {/* Action Buttons */}
          {editing && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.cancelButton, { marginRight: 6 }]}
                onPress={() => {
                  setEditing(false);
                  // Reset form
                  if (driverProfile) {
                    setPhoneNumber(driverProfile.phone_number || "");
                    setStreet(driverProfile.address?.street || "");
                    setCity(driverProfile.address?.city || "");
                    setStateProvince(driverProfile.address?.state_province || "");
                    setZipPostal(driverProfile.address?.zip_postal || "");
                    setVehicleMake(driverProfile.vehicle?.make || "");
                    setVehicleModel(driverProfile.vehicle?.model || "");
                    setVehicleYear(driverProfile.vehicle?.year?.toString() || "");
                    setVehicleVin(driverProfile.vehicle?.vin_number || "");
                    setLicensePhotoPath(driverProfile.license_photo_path);
                    setInsurancePhotoPath(driverProfile.insurance_photo_path);
                    setMedicalCardPhotoPath(driverProfile.medical_card_photo_path);
                  }
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { marginLeft: 6 },
                  updateMutation.isPending && styles.saveButtonDisabled,
                ]}
                onPress={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
              >
                <Text style={styles.saveButtonText}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: "#666",
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: PRIMARY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editButton: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
  },
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
  buttonContainer: {
    flexDirection: "row",
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: PRIMARY,
    alignItems: "center",
  },
  cancelButtonText: {
    color: PRIMARY,
    fontSize: 15,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  logoutButton: {
    marginHorizontal: 24,
    marginTop: 32,
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
