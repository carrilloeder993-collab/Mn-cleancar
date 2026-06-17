import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { colors, imageForService } from "../../src/lib/theme";

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [service, setService] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/services");
        const s = data.find((x: any) => x.id === id);
        setService(s);
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <View style={[styles.bg, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!service) return <View style={styles.bg}><Text style={{ color: "#fff", padding: 20 }}>Servicio no encontrado</Text></View>;

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <ScrollView>
        <View style={styles.heroWrap}>
          <Image source={{ uri: imageForService(service.name) }} style={styles.hero} />
          <TouchableOpacity testID="service-back-button" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.title}>{service.name}</Text>
            <Text style={styles.price}>${service.price}</Text>
          </View>

          <Text style={styles.section}>¿Qué incluye?</Text>
          {service.includes.map((item: string, i: number) => (
            <View key={i} style={styles.includeRow}>
              <Ionicons name="checkmark-circle" color={colors.primary} size={20} />
              <Text style={styles.includeTxt}>{item}</Text>
            </View>
          ))}

          <TouchableOpacity
            testID="service-book-button"
            style={styles.btn}
            onPress={() => router.push({ pathname: "/booking", params: { id: service.id } })}
          >
            <Text style={styles.btnTxt}>Confirmar y agendar</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  heroWrap: { position: "relative" },
  hero: { width: "100%", height: 240 },
  back: {
    position: "absolute", top: 8, left: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  body: { padding: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", flex: 1 },
  price: { color: colors.primary, fontSize: 24, fontWeight: "800" },
  section: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 24, marginBottom: 12 },
  includeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  includeTxt: { color: colors.textMuted, fontSize: 15, flex: 1 },
  btn: {
    marginTop: 32, backgroundColor: colors.primary, height: 54, borderRadius: 14,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
