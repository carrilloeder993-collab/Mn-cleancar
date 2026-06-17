import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

type Booking = {
  id: string; service_name: string; date: string; hour: number;
  vehicle_type: string; address: string; status: string; final_price: number; coupon_code?: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "Esperando confirmación", color: colors.warning },
  confirmed: { label: "Confirmada", color: colors.success },
  rejected: { label: "Rechazada", color: colors.danger },
  completed: { label: "Completada", color: colors.primary },
};

export default function MyBookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/bookings/me");
      setItems(data);
    } finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <Text style={styles.title}>Mis citas</Text>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>Aún no tienes citas. ¡Agenda una en la pestaña Servicios!</Text>
        ) : (
          items.map((b) => {
            const s = STATUS_LABEL[b.status] || { label: b.status, color: colors.textMuted };
            return (
              <View key={b.id} testID={`my-booking-${b.id}`} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.svcName}>{b.service_name}</Text>
                  <View style={[styles.badge, { backgroundColor: s.color + "22" }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                  </View>
                </View>
                <Text style={styles.row}>📅 {b.date} a las {b.hour}:00 hrs</Text>
                <Text style={styles.row}>🚗 {b.vehicle_type}</Text>
                <Text style={styles.row}>📍 {b.address}</Text>
                {b.coupon_code && <Text style={styles.row}>🎟️ Cupón: {b.coupon_code}</Text>}
                <Text style={styles.price}>Total: ${b.final_price}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 60, fontSize: 14, paddingHorizontal: 40 },
  card: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  svcName: { color: colors.text, fontWeight: "700", fontSize: 16, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  row: { color: colors.textMuted, fontSize: 13 },
  price: { color: colors.primary, fontWeight: "800", fontSize: 16, marginTop: 6 },
});
