import React, { useRef, useState } from "react";
import {
  LayoutRectangle,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY!;

export interface AddressData {
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

interface GooglePrediction {
  description: string;
  place_id: string;
}

interface AddressAutocompleteProps {
  value: string;
  placeholder: string | null;
  onChangeText: (text: string) => void;
  onAddressSelect: (data: AddressData) => void;
}

export default function AddressAutocomplete({
  value,
  placeholder,
  onChangeText,
  onAddressSelect,
}: AddressAutocompleteProps) {
  const [results, setResults] = useState<GooglePrediction[]>([]);
  const [inputLayout, setInputLayout] = useState<LayoutRectangle | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      return;
    }

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text
        )}&key=${GOOGLE_PLACES_API_KEY}&types=address`
      );
      const json = await res.json();
      setResults(json.predictions ?? []);
    } catch (error) {
      console.error("Autocomplete error:", error);
    }
  };

  const handleChange = (text: string) => {
    onChangeText(text);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(text);
    }, 300);
  };

  const handleSelect = async (prediction: GooglePrediction) => {
    onChangeText(prediction.description);
    setResults([]);

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&key=${GOOGLE_PLACES_API_KEY}`
      );
      const json = await res.json();
      const result = json.result;

      const get = (type: string) =>
        result.address_components.find((c: any) => c.types.includes(type))
          ?.long_name;

      onAddressSelect({
        address: prediction.description,
        city: get("locality"),
        state: get("administrative_area_level_1"),
        postalCode: get("postal_code"),
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        placeId: prediction.place_id,
      });
    } catch (error) {
      console.error("Place details error:", error);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder? placeholder : "Enter address..."}
        placeholderTextColor="#555"
        style={styles.input}
        onLayout={(e) => setInputLayout(e.nativeEvent.layout)}
      />

      {results.length > 0 && inputLayout && (
        <View
          style={[
            styles.dropdown,
            {
              top: inputLayout.height + 4,
              width: inputLayout.width,
            },
          ]}
        >
          <ScrollView 
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            style={styles.scrollView}
          >
            {results.map((item) => (
              <TouchableOpacity
                key={item.place_id}
                style={styles.item}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.itemText}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", position: "relative" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    backgroundColor: "white",
  },
  dropdown: {
    position: "absolute",
    left: 0,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    maxHeight: 220,
    zIndex: 1000,
  },
  scrollView: {
    maxHeight: 220,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemText: { fontSize: 14 },
});