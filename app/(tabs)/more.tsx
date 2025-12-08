import { Colors } from "@/constants/Colors";
import { Book, Calendar, ChevronRight, Clock, CreditCard, Settings } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface MenuItemProps {
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}

function MenuItem({ icon, title, onPress }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuItemLeft}>
        <View style={styles.iconContainer}>{icon}</View>
        <Text style={styles.menuItemText}>{title}</Text>
      </View>
      <ChevronRight size={20} color="#94A3B8" />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const handlePress = (page: string) => {
    console.log(`Navigate to ${page}`);
    // TODO: Implement navigation
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuCard}>
          <MenuItem
            icon={<Settings size={22} color={Colors.blue} />}
            title="Manage Account"
            onPress={() => handlePress("Manage Account")}
          />
          <MenuItem
            icon={<CreditCard size={22} color={Colors.blue} />}
            title="Payment History"
            onPress={() => handlePress("Payment History")}
          />
          <MenuItem
            icon={<Book size={22} color={Colors.blue} />}
            title="Driver Bluebook"
            onPress={() => handlePress("Driver Bluebook")}
          />
          <MenuItem
            icon={<Clock size={22} color={Colors.blue} />}
            title="Set My Availability"
            onPress={() => handlePress("Availability")}
          />
          <MenuItem
            icon={<Calendar size={22} color={Colors.blue} />}
            title="See Fleet Schedule"
            onPress={() => handlePress("Schedule")}
          />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#334155",
  },
});
