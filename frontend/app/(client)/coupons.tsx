import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

type Coupon = { id: string; code: string; type: string; value: number; note?: string };

function describe(c: Coupon) {
  if (c.type === "discount_percent") return `${c.value}% de descuento`;
  if (c.type === "discount_amount") return `$${c.value} de descuento`;
  if (c.type === "loyalty_full") return `🎁 Limpieza completa por $${c.value}`;
  return "Servicio GRATIS";
}

export default function MyCoupons() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/coupons/me");
      setItems(data);
    } finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <Text style={styles.title}>Mis cupones</Text>
      <Text style={styles.sub}>Úsalos al agendar un servicio</Text>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No tienes cupones disponibles por el momento.</Text>
        ) : (
          items.map((c) => (
            <View key={c.id} testID={`coupon-card-${c.id}`} style={styles.card}>
              <Ionicons name="gift" size={32} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{c.code}</Text>
                <Text style={styles.desc}>{describe(c)}</Text>
                {c.note ? <Text style={styles.note}>{c.note}</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", paddingHorizontal: 20, paddingTop: 16 },
  sub: { color: colors.textMuted, paddingHorizontal: 20, paddingBottom: 8, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 60, fontSize: 14, paddingHorizontal: 40 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: colors.surface, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  code: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  desc: { color: colors.primary, fontSize: 14, marginTop: 4, fontWeight: "600" },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
