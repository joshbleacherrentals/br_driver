import { Colors } from "@/constants/Colors";
import { DollarSign } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Sample earnings data
const earningsData = [
  { day: "Mon", amount: 287.43, shortDay: "M" },
  { day: "Tue", amount: 314.67, shortDay: "T" },
  { day: "Wed", amount: 268.92, shortDay: "W" },
  { day: "Thu", amount: 229.56, shortDay: "T" },
  { day: "Fri", amount: 0, shortDay: "F" },
  { day: "Sat", amount: 0, shortDay: "S" },
  { day: "Sun", amount: 0, shortDay: "S" },
];

const subtotal = 1100.58;
const taxRate = 0.13;
const tax = subtotal * taxRate;
const total = subtotal + tax;

const totalTrips = 5;
const totalDistance = 142.8; // miles
const totalTime = 32.5; // hours

export default function EarningsScreen() {
  const maxAmount = Math.max(...earningsData.map((d) => d.amount));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Earnings</Text>
          <Text style={styles.subtitle}>This Week</Text>
        </View>

        {/* Total Earnings Card */}
        <View style={styles.totalCard}>
          <View style={styles.totalIconContainer}>
            <DollarSign size={24} color={Colors.blue} />
          </View>
          <View style={styles.totalContent}>
            <Text style={styles.totalLabel}>Total Earnings</Text>
            <Text style={styles.totalAmount}>${total.toFixed(2)} USD</Text>
          </View>
        </View>

        {/* Bar Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Daily Earnings</Text>
          <View style={styles.chartContainer}>
            {earningsData.map((item, index) => {
              const barHeight = item.amount > 0 ? (item.amount / maxAmount) * 150 : 0;
              return (
                <View key={index} style={styles.barContainer}>
                  <View style={styles.barWrapper}>
                    {item.amount > 0 && (
                      <Text style={styles.barAmount}>${item.amount.toFixed(0)}</Text>
                    )}
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight || 4,
                          backgroundColor: item.amount > 0 ? Colors.blue : "#E2E8F0",
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.dayLabel}>{item.shortDay}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalTrips}</Text>
              <Text style={styles.statLabel}>Total Trips</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Miles</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalTime.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Hours</Text>
            </View>
          </View>
        </View>

        {/* Breakdown Section */}
        <View style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal</Text>
            <Text style={styles.breakdownValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Tax (13%)</Text>
            <Text style={styles.breakdownValue}>${tax.toFixed(2)}</Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.breakdownTotalLabel}>Total</Text>
            <Text style={styles.breakdownTotalValue}>${total.toFixed(2)} USD</Text>
          </View>
        </View>

        {/* Trip History Button */}
        <TouchableOpacity style={styles.historyButton} onPress={() => {}}>
          <Text style={styles.historyButtonText}>See Trip History</Text>
        </TouchableOpacity>

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
  subtitle: {
    fontSize: 14,
    color: "#64748B",
  },
  totalCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  totalIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  totalContent: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1E293B",
  },
  chartCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 200,
    paddingTop: 20,
  },
  barContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barWrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: 170,
  },
  bar: {
    width: 24,
    borderRadius: 4,
    minHeight: 4,
  },
  barAmount: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
  },
  dayLabel: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
    fontWeight: "500",
  },
  statsCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  breakdownCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  breakdownLabel: {
    fontSize: 14,
    color: "#64748B",
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  breakdownTotal: {
    borderBottomWidth: 0,
    paddingTop: 16,
    marginTop: 4,
  },
  breakdownTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  breakdownTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.blue,
  },
  historyButton: {
    backgroundColor: Colors.blue,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  historyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
