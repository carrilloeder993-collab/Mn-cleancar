import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

const TYPES = [
  { key: "discount_percent", label: "% Descuento" },
  { key: "discount_amount", label: "$ Descuento" },
  { key: "free_service", label: "Gratis" },
  { key: "loyalty_full", label: "Limpieza completa $" },
];

export default function AdminCoupons() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState("discount_percent");
  const [value, setValue] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = async () => {
    try { const { data } = await api.get("/coupons"); setItems(data); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!code.trim()) return Alert.alert("Falta el código");
    try {
      const { data } = await api.post("/coupons", {
        code: code.trim().toUpperCase(),
        type, value: parseFloat(value) || 0,
        assigned_to_phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        expires_at: expiresAt.trim() || undefined,
      });
      setShow(false); setCode(""); setValue(""); setPhone(""); setNote(""); setExpiresAt("");
      load();
      // Open WhatsApp link
      if (data.whatsapp_url) {
        Alert.alert(
          "Cupón creado",
          "¿Quieres enviarlo ahora por WhatsApp?",
          [{ text: "Después" }, { text: "Enviar", onPress: () => Linking.openURL(data.whatsapp_url) }]
        );
      }
    } catch (e) { Alert.alert("Error", apiError(e)); }
  };

  const sendWhatsApp = (c: any) => {
    const txt = encodeURIComponent(
      `🎟️ Cupón M&N Clean Car: *${c.code}*\n` +
      (c.type === "discount_percent" ? `Descuento ${c.value}%` :
       c.type === "discount_amount" ? `Descuento $${c.value} MXN` :
       c.type === "loyalty_full" ? `🎁 Limpieza completa por solo $${c.value} (recompensa de lealtad)` :
       "¡Servicio GRATIS!") +
      (c.note ? `\n${c.note}` : "") +
      "\nÚsalo desde la app M&N Clean Car al agendar."
    );
    const target = (c.assigned_to_phone || "").replace(/\D/g, "");
    Linking.openURL(`https://wa.me/${target ? "521" + target : ""}?text=${txt}`);
  };

  const del = async (id: string) => {
    Alert.alert("¿Eliminar cupón?", "", [
      { text: "Cancelar" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.delete(`/coupons/${id}`); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Cupones</Text>
        <TouchableOpacity testID="add-coupon" onPress={() => setShow(true)} style={styles.add}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> : items.length === 0 ? <Text style={styles.empty}>Sin cupones aún.</Text> :
          items.map((c) => (
            <View key={c.id} style={[styles.card, (c.used || c.expired) && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{c.code}{c.is_loyalty ? " 🎁" : ""}</Text>
                <Text style={styles.sub}>
                  {c.type === "discount_percent" ? `${c.value}% off`
                    : c.type === "discount_amount" ? `$${c.value} off`
                    : c.type === "loyalty_full" ? `Limpieza completa $${c.value}`
                    : "Gratis"}
                  {c.assigned_to_phone ? ` · 📱 ${c.assigned_to_phone}` : " · Sin asignar"}
                </Text>
                {c.expires_at && <Text style={{ color: c.expired ? colors.danger : colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {c.expired ? "⏰ Expirado" : `Vence: ${c.expires_at}`}
                </Text>}
                {c.used && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Usado por {c.used_by_phone}</Text>}
              </View>
              {!c.used && (
                <TouchableOpacity testID={`wa-${c.id}`} style={styles.iconBtn} onPress={() => sendWhatsApp(c)}>
                  <Ionicons name="logo-whatsapp" size={20} color={colors.success} />
                </TouchableOpacity>
              )}
              <TouchableOpacity testID={`del-coupon-${c.id}`} style={styles.iconBtn} onPress={() => del(c.id)}>
                <Ionicons name="trash" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
      </ScrollView>

      <Modal visible={show} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Nuevo cupón</Text>

            <Text style={styles.lbl}>Código</Text>
            <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.input} placeholder="Ej. VERANO10" placeholderTextColor={colors.textDim} testID="coupon-code" />

            <Text style={styles.lbl}>Tipo</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t.key} testID={`type-${t.key}`} style={[styles.chip, type === t.key && { backgroundColor: colors.primary }]} onPress={() => setType(t.key)}>
                  <Text style={{ color: type === t.key ? "#fff" : colors.text, fontWeight: "600", fontSize: 12 }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {type !== "free_service" && (
              <>
                <Text style={styles.lbl}>Valor</Text>
                <TextInput value={value} onChangeText={setValue} keyboardType="numeric" style={styles.input} placeholder={type === "discount_percent" ? "10" : "50"} placeholderTextColor={colors.textDim} testID="coupon-value" />
              </>
            )}

            <Text style={styles.lbl}>Teléfono cliente (opcional)</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="10 dígitos" placeholderTextColor={colors.textDim} testID="coupon-phone" />

            <Text style={styles.lbl}>Nota (opcional)</Text>
            <TextInput value={note} onChangeText={setNote} style={styles.input} placeholder="Mensaje extra para WhatsApp" placeholderTextColor={colors.textDim} />

            <Text style={styles.lbl}>Fecha de expiración (opcional)</Text>
            <TextInput value={expiresAt} onChangeText={setExpiresAt} style={styles.input} placeholder="YYYY-MM-DD (ej. 2026-12-31)" placeholderTextColor={colors.textDim} testID="coupon-expires" />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHi }]} onPress={() => setShow(false)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="create-coupon" style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={create}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  add: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 60 },
  card: { flexDirection: "row", padding: 14, backgroundColor: colors.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 8 },
  code: { color: colors.text, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  modal: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  lbl: { color: colors.textMuted, marginTop: 12, marginBottom: 6, fontWeight: "600", fontSize: 13 },
  input: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
});
