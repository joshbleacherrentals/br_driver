import { fetchDrivers } from "@/db/fetchDrivers";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Button, Text, View } from "react-native";

export const DriverFetcher: React.FC = () => {
  const { getToken, isSignedIn } = useAuth();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<any, Error>({
    queryKey: ["drivers"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const token = await getToken({ template: "supabase" });
      const result = await fetchDrivers(token ?? null);
      return result;
    },
  });
  const drivers = data?.drivers ?? [];

  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Button
        title={isLoading || isRefetching ? "Loading…" : "Refresh Drivers"}
        onPress={() => refetch()}
        disabled={isLoading || isRefetching}
      />
      {isError ? <Text style={{ color: "red" }}>{error?.message}</Text> : null}
      <Text>Drivers: {drivers.length}</Text>
      <View>
        {(drivers as any[]).map((item: any, idx: number) => (
          <View
            key={String((item as any).user_id ?? idx)}
            style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" }}
          >
            <Text style={{ fontWeight: "600" }}>
              {item.first_name} {item.last_name}
            </Text>
            <Text style={{ color: "#666" }}>{item.email}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default DriverFetcher;
