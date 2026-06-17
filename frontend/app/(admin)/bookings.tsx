import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

const FILTERS = [
  { key: "pending", label: "Pendientes" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "completed", label: "Completadas" },
  { key: "all", label: "Todas" },
];

export default function AdminBookings() {
  const [filter, setFilter] = useState("pending");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (f = filter) => {
    try {
      const url = f === "all" ? "/bookings" : `/bookings?status=${f}`;
      const { data } = await api.get(url);
      setItems(data);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(filter); }, [filter]));

  const setStatus = async (id: string, status: string) => {
    try {
      const { data } = await api.patch(`/bookings/${id}/status`, { status });
      load(filter);
      if (data?.loyalty_coupon) {
        Alert.alert(
          "🎁 ¡Cupón de lealtad!",
          `El cliente ganó el cupón ${data.loyalty_coupon} (Limpieza completa $100). El sistema le notificó por push.`,
        );
      }
    } catch (e) { Alert.alert("Error", apiError(e)); }
  };

  const sendWhatsApp = (b: any, kind: "confirm" | "remind" | "reject" | "custom") => {
    const phone = (b.user_phone || "").replace(/\D/g, "");
    let txt = "";
    if (kind === "confirm") {
      txt = `Hola ${b.user_name}! 🚗💧 M&N Clean Car confirma tu cita: *${b.service_name}* el ${b.date} a las ${b.hour}:00. Te esperamos en ${b.address}.`;
    } else if (kind === "remind") {
      txt = `Hola ${b.user_name}, recordatorio M&N Clean Car: tu ${b.service_name} es hoy a las ${b.hour}:00 en ${b.address}. ¡Estamos en camino!`;
    } else if (kind === "reject") {
      txt = `Hola ${b.user_name}, lamentablemente no podemos atender tu cita del ${b.date} a las ${b.hour}:00. ¿Podemos reagendarte?`;
    } else {
      txt = `Hola ${b.user_name}, te escribimos de M&N Clean Car sobre tu cita del ${b.date} a las ${b.hour}:00.`;
    }
    Linking.openURL(`https://wa.me/521${phone}?text=${encodeURIComponent(txt)}`);
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <Text style={styles.title}>Citas</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            testID={`filter-${f.key}`}
            style={[styles.filter, filter === f.key && styles.filterSel]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterTxt, filter === f.key && { color: "#fff" }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} tintColor={colors.primary} />}
      >
        {loading ? <ActivityIndicator color={colors.primary} /> :
          items.length === 0 ? <Text style={styles.empty}>Sin citas en este estado.</Text> :
            items.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.head}>
                  <Text style={styles.name}>{b.user_name}</Text>
                  <Text style={styles.price}>${b.final_price}</Text>
                </View>
                <Text style={styles.line}>📞 {b.user_phone}</Text>
                <Text style={styles.line}>🛠️ {b.service_name}</Text>
                <Text style={styles.line}>📅 {b.date} · {b.hour}:00</Text>
                <Text style={styles.line}>🚗 {b.vehicle_type}</Text>
                <Text style={styles.line}>📍 {b.address}</Text>
                {b.coupon_code && <Text style={styles.line}>🎟️ {b.coupon_code}</Text>}

                <View style={styles.actions}>
                  {b.status === "pending" && (
                    <>
                      <TouchableOpacity testID={`confirm-${b.id}`} style={[styles.btn, { backgroundColor: colors.success }]} onPress={() => setStatus(b.id, "confirmed")}>
                        <Text style={styles.btnTxt}>Confirmar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`reject-${b.id}`} style={[styles.btn, { backgroundColor: colors.danger }]} onPress={() => setStatus(b.id, "rejected")}>
                        <Text style={styles.btnTxt}>Rechazar</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {b.status === "confirmed" && (
                    <TouchableOpacity testID={`complete-${b.id}`} style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => setStatus(b.id, "completed")}>
                      <Text style={styles.btnTxt}>Marcar completada</Text>
                    </TouchableOpacity>
                  )}
                  {(b.status === "rejected" || b.status === "completed") && (
                    <Text style={[styles.line, { color: colors.textMuted }]}>Estado: {b.status}</Text>
                  )}
                </View>

                <View style={styles.waRow}>
                  {b.status === "pending" && (
                    <TouchableOpacity testID={`wa-confirm-${b.id}`} style={styles.waBtn} onPress={() => sendWhatsApp(b, "confirm")}>
                      <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
                      <Text style={styles.waTxt}>Confirmar por WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === "confirmed" && (
                    <TouchableOpacity testID={`wa-remind-${b.id}`} style={styles.waBtn} onPress={() => sendWhatsApp(b, "remind")}>
                      <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
                      <Text style={styles.waTxt}>Recordar por WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity testID={`wa-custom-${b.id}`} style={[styles.waBtn, { flex: 0, paddingHorizontal: 14 }]} onPress={() => sendWhatsApp(b, "custom")}>
                    <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", paddingHorizontal: 20, paddingTop: 12 },
  filters: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  filterSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterTxt: { color: colors.text, fontWeight: "600", fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 60 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, gap: 4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  name: { color: colors.text, fontWeight: "700", fontSize: 16 },
  price: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  line: { color: colors.textMuted, fontSize: 13 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
