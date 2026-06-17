import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, apiError } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, imageForService, LOGO_URL } from "../../src/lib/theme";

type Service = { id: string; name: string; price: number; includes: string[]; active: boolean };

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/services");
      setServices(data);
    } catch (e) {
      console.warn(apiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Image source={{ uri: LOGO_URL }} style={styles.logoSm} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hola,</Text>
          <Text testID="home-username" style={styles.userName}>{user?.name}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <Text style={styles.section}>Nuestros servicios</Text>
        <Text style={styles.sectionSub}>Elige uno para agendar tu cita</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          services.map((s) => (
            <TouchableOpacity
              key={s.id}
              testID={`service-card-${s.id}`}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: "/service/[id]", params: { id: s.id } })}
            >
              <Image source={{ uri: imageForService(s.name) }} style={styles.cardImg} />
              <View style={styles.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.name}</Text>
                  <Text style={styles.cardIncludes}>{s.includes.length} pasos incluidos</Text>
                </View>
                <View style={styles.priceTag}>
                  <Text style={styles.priceValue}>${s.price}</Text>
                  <Ionicons name="chevron-forward" color={colors.primary} size={20} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", padding: 20, gap: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  logoSm: { width: 56, height: 56 },
  hello: { color: colors.textMuted, fontSize: 13 },
  userName: { color: colors.text, fontSize: 18, fontWeight: "700" },
  scroll: { padding: 20, paddingBottom: 100 },
  section: { color: colors.text, fontSize: 22, fontWeight: "700" },
  sectionSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 18 },
  card: {
    backgroundColor: colors.surface, borderRadius: 18, marginBottom: 14,
    overflow: "hidden", borderWidth: 1, borderColor: colors.border,
  },
  cardImg: { width: "100%", height: 140 },
  cardBody: { flexDirection: "row", padding: 16, alignItems: "center", gap: 12 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  cardIncludes: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  priceTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(30,136,229,0.12)", paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 12,
  },
  priceValue: { color: colors.primary, fontWeight: "800", fontSize: 16 },
});
