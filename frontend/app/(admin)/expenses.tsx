import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

const CATS = [
  { key: "producto", label: "Producto" },
  { key: "gasolina", label: "Gasolina" },
  { key: "otro", label: "Otro" },
];

export default function AdminExpenses() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("");
  const [yieldServices, setYieldServices] = useState("40");
  const [cat, setCat] = useState("producto");

  const load = async () => {
    try { const { data } = await api.get("/expenses"); setItems(data); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!name.trim() || !cost) return Alert.alert("Faltan datos");
    try {
      await api.post("/expenses", {
        product_name: name.trim(), cost: parseFloat(cost),
        quantity: qty.trim() || "—", services_yield: parseInt(yieldServices) || 0, category: cat,
      });
      setShow(false); setName(""); setCost(""); setQty(""); setYieldServices("40"); setCat("producto");
      load();
    } catch (e) { Alert.alert("Error", apiError(e)); }
  };

  const del = async (id: string) => {
    Alert.alert("¿Eliminar gasto?", "", [
      { text: "Cancelar" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.delete(`/expenses/${id}`); load(); } },
    ]);
  };

  const total = items.reduce((s, i) => s + (i.cost || 0), 0);

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Egresos</Text>
        <TouchableOpacity testID="add-expense" onPress={() => setShow(true)} style={styles.add}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLbl}>Total acumulado</Text>
        <Text style={styles.totalVal}>${total.toFixed(2)}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          items.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{e.product_name}</Text>
                <Text style={styles.sub}>{e.quantity} · {e.category} · rinde {e.services_yield}</Text>
              </View>
              <Text style={styles.cost}>${e.cost}</Text>
              <TouchableOpacity testID={`del-exp-${e.id}`} style={styles.iconBtn} onPress={() => del(e.id)}>
                <Ionicons name="trash" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
      </ScrollView>

      <Modal visible={show} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Nuevo egreso</Text>

            <Text style={styles.lbl}>Nombre del producto</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Ej. Shampoo prelavado" placeholderTextColor={colors.textDim} testID="exp-name" />

            <Text style={styles.lbl}>Costo</Text>
            <TextInput value={cost} onChangeText={setCost} keyboardType="numeric" style={styles.input} placeholder="115" placeholderTextColor={colors.textDim} testID="exp-cost" />

            <Text style={styles.lbl}>Cantidad / presentación</Text>
            <TextInput value={qty} onChangeText={setQty} style={styles.input} placeholder="4 lts" placeholderTextColor={colors.textDim} testID="exp-qty" />

            <Text style={styles.lbl}>Rinde para X servicios</Text>
            <TextInput value={yieldServices} onChangeText={setYieldServices} keyboardType="numeric" style={styles.input} placeholder="40" placeholderTextColor={colors.textDim} testID="exp-yield" />

            <Text style={styles.lbl}>Categoría</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {CATS.map((c) => (
                <TouchableOpacity key={c.key} style={[styles.chip, cat === c.key && { backgroundColor: colors.primary }]} onPress={() => setCat(c.key)}>
                  <Text style={{ color: cat === c.key ? "#fff" : colors.text, fontWeight: "600", fontSize: 12 }}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHi }]} onPress={() => setShow(false)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-exp" style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={create}>
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
  totalCard: { marginHorizontal: 20, padding: 16, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  totalLbl: { color: colors.textMuted, fontSize: 12 },
  totalVal: { color: colors.danger, fontSize: 26, fontWeight: "800", marginTop: 4 },
  card: { flexDirection: "row", padding: 14, backgroundColor: colors.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 10 },
  name: { color: colors.text, fontWeight: "700", fontSize: 14 },
  sub: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  cost: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  modal: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  lbl: { color: colors.textMuted, marginTop: 12, marginBottom: 6, fontWeight: "600", fontSize: 13 },
  input: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
});
