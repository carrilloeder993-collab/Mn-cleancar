import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../src/lib/api";
import { colors } from "../src/lib/theme";

const VEHICLES = ["Sedán", "SUV", "Camioneta", "Hatchback", "Pickup"];

type Slot = { start_minutes: number; label: string; available: boolean };
type Service = { id: string; name: string; price: number; duration_minutes: number; includes: string[]; active: boolean };
type CouponState = {
  status: "idle" | "checking" | "valid" | "invalid";
  message?: string; final_price?: number; savings?: number;
};

function nextDays(n: number) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push({
      iso: `${yyyy}-${mm}-${dd}`,
      label: d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return days;
}

function hhmm(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

export default function Booking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const days = nextDays(14);

  const [services, setServices] = useState<Service[]>([]);
  const [mainService, setMainService] = useState<Service | null>(null);
  const [extraService, setExtraService] = useState<Service | null>(null);

  const [date, setDate] = useState(days[0].iso);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState("Sedán");
  const [address, setAddress] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponState, setCouponState] = useState<CouponState>({ status: "idle" });
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const couponDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load services
  useEffect(() => {
    (async () => {
      const { data } = await api.get("/services");
      setServices(data);
      const m = data.find((s: Service) => s.id === id);
      setMainService(m || null);
    })();
  }, [id]);

  const totalDuration = (mainService?.duration_minutes || 60) + (extraService?.duration_minutes || 0);
  const totalBase = (mainService?.price || 0) + (extraService?.price || 0);

  const loadSlots = async () => {
    if (!mainService) return;
    setLoadingSlots(true); setStart(null);
    try {
      const params = new URLSearchParams({ date, service_id: mainService.id });
      if (extraService) params.set("extra_service_id", extraService.id);
      const { data } = await api.get(`/bookings/availability?${params.toString()}`);
      setSlots(data.slots);
    } catch (e) { console.warn(apiError(e)); }
    finally { setLoadingSlots(false); }
  };

  useEffect(() => { loadSlots(); }, [date, mainService?.id, extraService?.id]);

  // coupon validation debounced
  useEffect(() => {
    if (couponDebounce.current) clearTimeout(couponDebounce.current);
    if (!coupon.trim() || !mainService) { setCouponState({ status: "idle" }); return; }
    setCouponState({ status: "checking" });
    couponDebounce.current = setTimeout(async () => {
      try {
        const { data } = await api.post("/coupons/validate", {
          code: coupon.trim().toUpperCase(), service_id: mainService.id,
          extra_service_id: extraService?.id,
        });
        if (data.valid) setCouponState({ status: "valid", message: data.message, final_price: data.final_price, savings: data.savings });
        else setCouponState({ status: "invalid", message: data.message });
      } catch (e) { setCouponState({ status: "invalid", message: apiError(e) }); }
    }, 600);
    return () => { if (couponDebounce.current) clearTimeout(couponDebounce.current); };
  }, [coupon, mainService?.id, extraService?.id]);

  const submit = async () => {
    if (!mainService) return;
    if (start === null) { Alert.alert("Falta horario", "Selecciona una hora disponible"); return; }
    if (!address.trim()) { Alert.alert("Falta domicilio", "Ingresa tu dirección"); return; }
    if (coupon.trim() && couponState.status === "invalid") {
      Alert.alert("Cupón inválido", "Quita el cupón o corrige el código"); return;
    }
    setSubmitting(true);
    try {
      await api.post("/bookings", {
        service_id: mainService.id, date, start_minutes: start,
        vehicle_type: vehicle, address: address.trim(),
        coupon_code: coupon.trim() || undefined,
        extra_service_id: extraService?.id,
      });
      setSubmitting(false); setShowSuccess(true);
      setTimeout(() => { setShowSuccess(false); router.replace("/(client)/home"); }, 7000);
    } catch (e: any) {
      Alert.alert("No se pudo agendar", apiError(e)); setSubmitting(false);
    }
  };

  const extras = services.filter(s => s.active && s.id !== mainService?.id);
  const displayPrice = couponState.status === "valid" && couponState.final_price !== undefined ? couponState.final_price : totalBase;

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity testID="booking-back" onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.header}>Agendar cita</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {mainService && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{mainService.name}</Text>
              <Text style={styles.summarySub}>
                {mainService.duration_minutes} min · ${mainService.price}
                {extraService ? ` + ${extraService.name} (${extraService.duration_minutes} min, $${extraService.price})` : ""}
              </Text>
              <Text style={styles.summaryTotal}>
                Total: ${displayPrice} · {totalDuration} min
              </Text>
            </View>
          )}

          {extras.length > 0 && (
            <>
              <Text style={styles.label}>¿Quieres agregar un servicio extra?</Text>
              <View style={styles.extrasWrap}>
                <TouchableOpacity
                  testID="extra-none"
                  style={[styles.extraChip, !extraService && styles.extraChipSel]}
                  onPress={() => setExtraService(null)}
                >
                  <Text style={[styles.extraTxt, !extraService && { color: "#fff" }]}>Ninguno</Text>
                </TouchableOpacity>
                {extras.map((s) => {
                  const sel = extraService?.id === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      testID={`extra-${s.id}`}
                      style={[styles.extraChip, sel && styles.extraChipSel]}
                      onPress={() => setExtraService(s)}
                    >
                      <Text style={[styles.extraTxt, sel && { color: "#fff" }]}>+ {s.name} ${s.price}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.label}>Fecha</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const sel = d.iso === date;
              return (
                <TouchableOpacity key={d.iso} testID={`day-${d.iso}`} style={[styles.dayChip, sel && styles.dayChipSel]} onPress={() => setDate(d.iso)}>
                  <Text style={[styles.dayChipTxt, sel && { color: "#fff" }]}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Horario disponible · cada 20 min</Text>
          {loadingSlots ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.slotsWrap}>
              {slots.filter(s => s.available).map((s) => {
                const sel = start === s.start_minutes;
                return (
                  <TouchableOpacity
                    key={s.start_minutes}
                    testID={`slot-${s.start_minutes}`}
                    style={[styles.slotChip, sel && styles.slotChipSel]}
                    onPress={() => setStart(s.start_minutes)}
                  >
                    <Text style={[styles.slotTxt, sel && { color: "#fff" }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {slots.every(s => !s.available) && (
                <Text style={{ color: colors.textMuted, padding: 12 }}>
                  No hay horarios disponibles para este día con la duración requerida.
                </Text>
              )}
            </View>
          )}

          {start !== null && (
            <Text style={styles.endTime}>
              ⏱️ Termina aproximadamente a las {hhmm(start + totalDuration)}
            </Text>
          )}

          <Text style={styles.label}>Tipo de vehículo</Text>
          <View style={styles.slotsWrap}>
            {VEHICLES.map((v) => {
              const sel = v === vehicle;
              return (
                <TouchableOpacity key={v} testID={`vehicle-${v}`} style={[styles.slotChip, sel && styles.slotChipSel]} onPress={() => setVehicle(v)}>
                  <Text style={[styles.slotTxt, sel && { color: "#fff" }]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Domicilio</Text>
          <TextInput
            testID="booking-address" value={address} onChangeText={setAddress}
            placeholder="Calle, número, colonia, referencias"
            placeholderTextColor={colors.textDim}
            style={[styles.input, { height: 80, textAlignVertical: "top" }]} multiline
          />

          <Text style={styles.label}>Cupón (opcional)</Text>
          <TextInput
            testID="booking-coupon" value={coupon} onChangeText={setCoupon}
            placeholder="Código del cupón"
            placeholderTextColor={colors.textDim} autoCapitalize="characters"
            style={[
              styles.input,
              couponState.status === "valid" && { borderColor: colors.success, borderWidth: 2 },
              couponState.status === "invalid" && { borderColor: colors.danger, borderWidth: 2 },
            ]}
          />
          {couponState.status === "checking" && (
            <View style={styles.couponHint}><ActivityIndicator color={colors.primary} size="small" /><Text style={[styles.couponHintTxt, { color: colors.textMuted }]}>Validando…</Text></View>
          )}
          {couponState.status === "valid" && (
            <View style={[styles.couponHint, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
              <Ionicons name="checkmark-circle" color={colors.success} size={18} />
              <Text style={[styles.couponHintTxt, { color: colors.success }]}>{couponState.message} · Pagas ${couponState.final_price} (ahorras ${couponState.savings})</Text>
            </View>
          )}
          {couponState.status === "invalid" && (
            <View style={[styles.couponHint, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
              <Ionicons name="close-circle" color={colors.danger} size={18} />
              <Text style={[styles.couponHintTxt, { color: colors.danger }]}>{couponState.message}</Text>
            </View>
          )}

          <TouchableOpacity testID="booking-submit" style={[styles.btn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Solicitar cita</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.successWrap}>
          <View style={styles.successCard}>
            <View style={styles.checkCircle}><Ionicons name="checkmark" size={48} color="#fff" /></View>
            <Text style={styles.successTitle}>¡Muchas gracias por agendar con nosotros!</Text>
            <Text style={styles.successBody}>En un momento te contactaremos para confirmar tu servicio. 🚗💧</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  header: { color: colors.text, fontSize: 20, fontWeight: "700", flex: 1, textAlign: "center" },
  summary: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  summarySub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  summaryTotal: { color: colors.primary, fontSize: 16, fontWeight: "800", marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 20, marginBottom: 10 },
  extrasWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  extraChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  extraChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  extraTxt: { color: colors.text, fontWeight: "600", fontSize: 12 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dayChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipTxt: { color: colors.text, fontWeight: "600", fontSize: 13 },
  slotsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slotChip: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  slotChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotTxt: { color: colors.text, fontWeight: "600", fontSize: 13 },
  endTime: { color: colors.primary, fontWeight: "600", fontSize: 13, marginTop: 12 },
  input: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  couponHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, padding: 10, borderRadius: 10 },
  couponHintTxt: { fontSize: 13, fontWeight: "600", flex: 1 },
  btn: { marginTop: 28, backgroundColor: colors.primary, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  successWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 32 },
  successCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 28, alignItems: "center", borderWidth: 1, borderColor: colors.border, width: "100%", maxWidth: 360 },
  checkCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { color: colors.text, fontSize: 19, fontWeight: "800", textAlign: "center" },
  successBody: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 20 },
});
