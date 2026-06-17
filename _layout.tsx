import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/lib/theme";
import { ActivityIndicator, View } from "react-native";

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/" />;
  if (user.role !== "admin") return <Redirect href="/(client)/home" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 8 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Resumen", tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Citas", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: "Servicios", tabBarIcon: ({ color, size }) => <Ionicons name="water" color={color} size={size} /> }} />
      <Tabs.Screen name="coupons" options={{ title: "Cupones", tabBarIcon: ({ color, size }) => <Ionicons name="gift" color={color} size={size} /> }} />
      <Tabs.Screen name="expenses" options={{ title: "Egresos", tabBarIcon: ({ color, size }) => <Ionicons name="cash" color={color} size={size} /> }} />
    </Tabs>
  );
}
