import { useFormTheme } from "@/hooks/useTheme";
import { typeScale } from "@/constants/theme";
import { parseGoogleAddressComponents } from "@/utils/parseGoogleAddress";
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
  /** The street line only — what `Addresses.street` holds. */
  address: string;
  /** Google's full one-line address, for the text field to show. */
  formatted?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** ISO-2 country code — `Addresses.country`. */
  country?: string;
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

  const { form: theme } = useFormTheme();

  const fetchSuggestions = async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      return;
    }

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text,
        )}&key=${GOOGLE_PLACES_API_KEY}&types=address&language=en`,
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
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&key=${GOOGLE_PLACES_API_KEY}&language=en`,
      );
      const json = await res.json();
      const result = json.result;

      const englishAddress = result.formatted_address || prediction.description;
      onChangeText(englishAddress);

      // The street line, city, state, zip and ISO-2 country, each into its own
      // column — see utils/parseGoogleAddress.ts for why the full suggestion
      // is no longer what lands in `street`.
      const parsed = parseGoogleAddressComponents(
        result.address_components ?? [],
        englishAddress,
      );

      onAddressSelect({
        ...parsed,
        formatted: englishAddress,
        // Google hands us the geocode at selection time; persisting it is what
        // lets a maps app be opened on coordinates instead of on text.
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
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
        placeholder={placeholder ? placeholder : "Enter address..."}
        placeholderTextColor={theme.placeholder}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        onLayout={(e) => setInputLayout(e.nativeEvent.layout)}
      />

      {results.length > 0 && inputLayout && (
        <View
          style={[
            styles.dropdown,
            {
              top: inputLayout.height + 4,
              width: inputLayout.width,
              backgroundColor: theme.card,
              borderColor: theme.border,
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
                style={[styles.item, { borderBottomColor: theme.separator }]}
                onPress={() => handleSelect(item)}
              >
                <Text style={[styles.itemText, { color: theme.text }]}>
                  {item.description}
                </Text>
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
    borderRadius: 6,
    padding: 12,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    borderWidth: 1,
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
  },
  itemText: { ...typeScale.subhead },
});
