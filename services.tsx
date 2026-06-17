import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

export default function AdminServices() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [includes, setIncludes] = useState("");
  const [active, setActive] = useState(true);

  const load = async () => {
    try { const { data } = await api.get("/services"); setItems(data); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const open = (s?: any) => {
    setEditing(s || null);
    setName(s?.name || "");
    setPrice(String(s?.price || ""));
    setDuration(String(s?.duration_minutes || 60));
    setIncludes((s?.includes || []).join("\n"));
    setActive(s?.active ?? true);
    setShowForm(true);
  };

  const save = async () => {
    const body = {
      name: name.trim(), price: parseFloat(price) || 0,
      duration_minutes: parseInt(duration) || 60,
      includes: includes.split("\n").map(s => s.trim()).filter(Boolean),
      active,
    };
    if (!body.name) return Alert.alert("Falta nombre");
    if (body.duration_minutes <= 0 || body.duration_minutes > 480) return Alert.alert("Duración inválida (1-480 min)");
    try {
      if (editing) await api.put(`/services/${editing.id}`, body);
      else await api.post("/services", body);
      setShowForm(false);
      load();
    } catch (e) { Alert.alert("Error", apiError(e)); }
  };

  const del = async (id: string) => {
    Alert.alert("¿Eliminar servicio?", "", [
      { text: "Cancelar" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.delete(`/services/${id}`); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Servicios</Text>
        <TouchableOpacity testID="add-service" onPress={() => open()} style={styles.add}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> : items.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.name} {!s.active && <Text style={{ color: colors.warning }}>(inactivo)</Text>}</Text>
              <Text style={styles.price}>${s.price} · {s.duration_minutes || 60} min</Text>
              <Text style={styles.sub}>{s.includes.length} pasos · {s.completed_count || 0} completados</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity testID={`edit-svc-${s.id}`} onPress={() => open(s)} style={styles.iconBtn}><Ionicons name="pencil" size={18} color={colors.primary} /></TouchableOpacity>
              <TouchableOpacity testID={`del-svc-${s.id}`} onPress={() => del(s.id)} style={styles.iconBtn}><Ionicons name="trash" size={18} color={colors.danger} /></TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing ? "Editar servicio" : "Nuevo servicio"}</Text>

            <Text style={styles.lbl}>Nombre</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Ej. Limpieza exterior" placeholderTextColor={colors.textDim} testID="svc-name" />

            <Text style={styles.lbl}>Precio (MXN)</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" style={styles.input} placeholder="80" placeholderTextColor={colors.textDim} testID="svc-price" />

            <Text style={styles.lbl}>Duración (minutos)</Text>
            <TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" style={styles.input} placeholder="60" placeholderTextColor={colors.textDim} testID="svc-duration" />

            <Text style={styles.lbl}>Incluye (uno por línea)</Text>
            <TextInput value={includes} onChangeText={setIncludes} multiline style={[styles.input, { height: 140, textAlignVertical: "top" }]} placeholder="Prelavado&#10;Lavado de contacto" placeholderTextColor={colors.textDim} testID="svc-includes" />

            <TouchableOpacity onPress={() => setActive(!active)} style={styles.toggle}>
              <Ionicons name={active ? "checkbox" : "square-outline"} color={colors.primary} size={22} />
              <Text style={{ color: colors.text, marginLeft: 8 }}>Servicio activo</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHi }]} onPress={() => setShowForm(false)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-svc" style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={save}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Guardar</Text>
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
  card: { flexDirection: "row", padding: 16, backgroundColor: colors.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  name: { color: colors.text, fontWeight: "700", fontSize: 15 },
  price: { color: colors.primary, fontWeight: "800", fontSize: 16, marginTop: 2 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  modal: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 16 },
  lbl: { color: colors.textMuted, marginTop: 12, marginBottom: 6, fontWeight: "600", fontSize: 13 },
  input: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  toggle: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
});
