import BottomSheetModal from "@/components/ui/BottomSheetModal";
import { useContact } from "@/hooks/db/useContact";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { contactDisplayName } from "@/utils/contact";
import { formatPhoneNumber, telUri } from "@/utils/phone";
import { isTripAccepted } from "@/utils/workTrackerStatus";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * The trip leg's on-site contact, as a tappable pill that opens their details.
 *
 * Sits beside the stop's time in the PICKUP / DROP-OFF header, mirroring the
 * pay pill in `payBreakdown.tsx` — same shape, same accent treatment, so the
 * two affordances on a trip card read as one family.
 *
 * Renders nothing at all unless the office attached a contact to *this* leg,
 * the driver has taken the trip on, and the contact row has synced down. Any
 * of the three can fail on its own, and a button that opens an empty sheet is
 * worse than no button.
 */
export function ContactButton({
  contactId,
  status,
  acceptedAt,
}: {
  contactId: string | null | undefined;
  status: string | null | undefined;
  acceptedAt: string | null | undefined;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeChipStyles);
  const [visible, setVisible] = React.useState(false);

  const allowed = isTripAccepted(status, acceptedAt);
  // The hook is called unconditionally; passing null keeps it inert.
  const { contact } = useContact(allowed ? contactId : null);

  if (!allowed || !contactId || !contact) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.chip}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="View contact"
      >
        <Ionicons name="person-outline" size={14} color={theme.accent} />
        <Text style={[styles.chipLabel, { color: theme.accent }]}>Contact</Text>
        <Ionicons name="chevron-down" size={14} color={theme.accent} />
      </TouchableOpacity>

      {visible && (
        <ContactSheet
          visible={visible}
          contactId={contactId}
          onClose={() => setVisible(false)}
        />
      )}
    </>
  );
}

/**
 * The contact's details, and the call.
 *
 * The number is shown formatted for reading but dialed normalized: the column
 * is free text, so what an office user typed is not what the dialer can take.
 * With no dialable number the row is inert text rather than a button — a
 * dialer opened on an empty field is a dead end.
 */
export function ContactSheet({
  visible,
  contactId,
  onClose,
}: {
  visible: boolean;
  contactId: string | null | undefined;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeSheetStyles);
  const { contact } = useContact(contactId);

  const name = contactDisplayName(contact);
  const dialable = telUri(contact?.phone);

  const call = async () => {
    if (!dialable) return;
    try {
      if (!(await Linking.canOpenURL(dialable))) {
        Alert.alert("Cannot place call", "This device cannot make phone calls.");
        return;
      }
      await Linking.openURL(dialable);
    } catch {
      Alert.alert("Cannot place call", "Something went wrong placing the call.");
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contact</Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.name}>{name ?? "Unnamed contact"}</Text>

        {dialable ? (
          <TouchableOpacity
            style={styles.callRow}
            onPress={call}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Call ${name ?? "contact"}`}
          >
            <Ionicons name="call-outline" size={18} color={theme.accent} />
            <Text style={[styles.phone, { color: theme.accent }]}>
              {formatPhoneNumber(contact?.phone)}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noPhone}>No phone number on file</Text>
        )}
      </ScrollView>
    </BottomSheetModal>
  );
}

function makeChipStyles(theme: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      backgroundColor: theme.accentSoft,
      borderRadius: radius.pill,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    chipLabel: { ...typeScale.footnote, fontWeight: "700" },
  });
}

function makeSheetStyles(theme: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    headerTitle: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    scrollContent: { padding: 20, paddingBottom: 40, gap: 12 },
    name: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    callRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      alignSelf: "flex-start",
      backgroundColor: theme.accentSoft,
      borderRadius: radius.pill,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    phone: { ...typeScale.callout, fontWeight: "700" },
    noPhone: { ...typeScale.subhead, color: theme.textSecondary },
  });
}
