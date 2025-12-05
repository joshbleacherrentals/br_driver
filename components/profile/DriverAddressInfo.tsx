import { GOOGLE_PLACES_API_KEY } from "@/constants/Constants";
import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";

interface DriverAddressInfoProps {
  street: string;
  setStreet: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
  stateProvince: string;
  setStateProvince: (value: string) => void;
  zipPostal: string;
  setZipPostal: (value: string) => void;
  editing: boolean;
}

export function DriverAddressInfo({
  street,
  setStreet,
  city,
  setCity,
  stateProvince,
  setStateProvince,
  zipPostal,
  setZipPostal,
  editing,
}: DriverAddressInfoProps) {
  const placesRef = useRef<any>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lastValidAddress, setLastValidAddress] = useState({
    street: "",
    city: "",
    stateProvince: "",
    zipPostal: "",
  });

  // Initialize input value and last valid address when street changes from parent
  useState(() => {
    if (street) {
      setInputValue(street);
      setLastValidAddress({ street, city, stateProvince, zipPostal });
    }
  });

  const handleAddressSelect = (data: any, details: any) => {
    if (!details) return;

    // Extract address components
    const addressComponents = details.address_components || [];

    const streetNumber =
      addressComponents.find((comp: any) => comp.types.includes("street_number"))?.long_name || "";

    const route =
      addressComponents.find((comp: any) => comp.types.includes("route"))?.long_name || "";

    const cityComp =
      addressComponents.find((comp: any) => comp.types.includes("locality"))?.long_name || "";

    const stateComp =
      addressComponents.find((comp: any) => comp.types.includes("administrative_area_level_1"))
        ?.short_name || "";

    const postalCodeComp =
      addressComponents.find((comp: any) => comp.types.includes("postal_code"))?.long_name || "";

    // Update all fields
    const fullStreet = `${streetNumber} ${route}`.trim();

    // Store as last valid address
    const validAddress = {
      street: fullStreet,
      city: cityComp,
      stateProvince: stateComp,
      zipPostal: postalCodeComp,
    };
    setLastValidAddress(validAddress);

    // Update parent state with valid address
    setStreet(fullStreet);
    setCity(cityComp);
    setStateProvince(stateComp);
    setZipPostal(postalCodeComp);

    // Update input display
    setInputValue(fullStreet);

    // Update the visible text & hide the list
    if (placesRef.current?.setAddressText) {
      placesRef.current.setAddressText(fullStreet);
    }
    setShowSuggestions(false);
  };

  // When user types without selecting, keep the last valid address
  const handleInputChange = (text: string) => {
    setInputValue(text);
    setShowSuggestions(!!text);
    // Don't update parent state - keep last valid address
  };

  // When editing ends, restore last valid address if user typed arbitrary text
  const handleBlur = () => {
    if (inputValue !== lastValidAddress.street) {
      // User typed something but didn't select - restore last valid address
      setInputValue(lastValidAddress.street);
      if (placesRef.current?.setAddressText) {
        placesRef.current.setAddressText(lastValidAddress.street);
      }
      // Ensure parent state still has last valid address
      setStreet(lastValidAddress.street);
      setCity(lastValidAddress.city);
      setStateProvince(lastValidAddress.stateProvince);
      setZipPostal(lastValidAddress.zipPostal);
    }
    setShowSuggestions(false);
  };

  return (
    <View style={styles.subsection}>
      <Text style={styles.subsectionTitle}>Address</Text>
      {editing ? (
        <View style={styles.field}>
          <Text style={styles.label}>Street</Text>
          <GooglePlacesAutocomplete
            ref={placesRef}
            placeholder="Start typing address..."
            onPress={handleAddressSelect}
            query={{
              key: GOOGLE_PLACES_API_KEY,
              language: "en",
            }}
            listViewDisplayed={showSuggestions}
            fetchDetails={true}
            enablePoweredByContainer={false}
            styles={{
              textInput: [styles.input],
              container: { flex: 0 },
              listView: {
                position: "absolute",
                top: 50,
                zIndex: 1000,
                backgroundColor: "white",
                borderRadius: 8,
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
              },
            }}
            textInputProps={{
              value: inputValue,
              onChangeText: handleInputChange,
              onBlur: handleBlur,
              placeholderTextColor: "#94A3B8",
            }}
          />
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>Street</Text>
          <TextInput style={[styles.input, styles.inputDisabled]} value={street} editable={false} />
        </View>
      )}
      <View style={styles.row}>
        <View style={[styles.field, styles.fieldHalf, { marginRight: 6 }]}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={city}
            placeholder="Toronto"
            editable={false}
          />
        </View>
        <View style={[styles.field, styles.fieldHalf, { marginLeft: 6 }]}>
          <Text style={styles.label}>State/Province</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={stateProvince}
            placeholder="ON"
            editable={false}
          />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Postal Code</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={zipPostal}
          placeholder="M1M 1M1"
          editable={false}
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
