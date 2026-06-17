import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/lib/theme";

export default function AdminDashboard() {
  const { logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/dashboard");
      setData(data);
    } finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const onLogout = async () => { await logout(); router.replace("/"); };

  if (loading || !data) return <View style={[styles.bg, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Panel Admin</Text>
        <TouchableOpacity testID="admin-logout" onPress={onLogout}><Ionicons name="log-out-outline" size={24} color={colors.danger} /></TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {data.restock_alert_global && (
          <View style={[styles.alert]}>
            <Ionicons name="warning" color={colors.warning} size={20} />
            <Text style={styles.alertTxt}>¡Alerta! Han pasado 20 servicios. Revisa el inventario.</Text>
          </View>
        )}

        <View style={styles.grid}>
          <Stat label="Pendientes" value={data.pending} color={colors.warning} />
          <Stat label="Confirmadas" value={data.confirmed} color={colors.success} />
          <Stat label="Completadas" value={data.completed} color={colors.primary} />
          <Stat label="Total citas" value={data.total_bookings} color={colors.text} />
        </View>

        <View style={styles.income}>
          <Text style={styles.incomeLabel}>Ingresos (completadas)</Text>
          <Text style={styles.incomeVal}>${data.income_total}</Text>
          <View style={styles.divider} />
          <Text style={styles.incomeLabel}>Egresos</Text>
          <Text style={[styles.incomeVal, { color: colors.danger }]}>${data.expense_total}</Text>
          <View style={styles.divider} />
          <Text style={styles.incomeLabel}>Ganancia neta</Text>
          <Text style={[styles.incomeVal, { color: data.net >= 0 ? colors.success : colors.danger }]}>${data.net}</Text>
        </View>

        <Text style={styles.section}>Servicios realizados</Text>
        {data.services.map((s: any) => (
          <View key={s.id} style={styles.row}>
            <Text style={styles.rowName}>{s.name}</Text>
            <Text style={styles.rowVal}>{s.completed_count}</Text>
          </View>
        ))}

        <Text style={styles.section}>Inventario</Text>
        {data.inventory.map((p: any, i: number) => (
          <View key={i} style={[styles.row, p.needs_restock_alert && { borderColor: colors.warning, borderWidth: 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{p.product_name}</Text>
              <Text style={styles.rowSub}>Rinde {p.services_yield} servicios · {p.quantity}</Text>
            </View>
            <Text style={[styles.rowVal, { color: p.services_until_restock <= 5 ? colors.warning : colors.textMuted }]}>
              Faltan {p.services_until_restock}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  alert: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 12, marginBottom: 12, alignItems: "center" },
  alertTxt: { color: colors.warning, fontSize: 13, fontWeight: "600", flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  stat: { flexBasis: "47%", backgroundColor: colors.surface, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  statVal: { fontSize: 28, fontWeight: "800" },
  statLbl: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  income: { backgroundColor: colors.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginVertical: 8 },
  incomeLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  incomeVal: { color: colors.success, fontSize: 22, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  section: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 24, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rowName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  rowVal: { color: colors.primary, fontWeight: "800", fontSize: 15 },
});
