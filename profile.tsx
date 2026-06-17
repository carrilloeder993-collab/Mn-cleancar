import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/lib/theme";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    router.replace("/");
  };

  const onWhatsApp = () => {
    Linking.openURL(
      "https://wa.me/5218717958646?text=" +
        encodeURIComponent("Hola M&N Clean Car, tengo una consulta.")
    );
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <Text style={styles.title}>Mi perfil</Text>

      <View style={styles.card}>
        <View style={styles.avatar}><Text style={styles.avatarTxt}>{(user?.name || "U").substring(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.name} testID="profile-name">{user?.name}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
      </View>

      <TouchableOpacity testID="profile-whatsapp" style={styles.row} onPress={onWhatsApp}>
        <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
        <Text style={styles.rowTxt}>Contáctanos por WhatsApp</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity testID="profile-logout" style={[styles.row, { borderColor: "rgba(239,68,68,0.3)" }]} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.rowTxt, { color: colors.danger }]}>Cerrar sesión</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", marginBottom: 16 },
  card: {
    backgroundColor: colors.surface, borderRadius: 18, padding: 24,
    alignItems: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 24,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarTxt: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  phone: { color: colors.textMuted, marginTop: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: colors.surface, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  rowTxt: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
});
