import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/lib/auth";
import { colors, LOGO_URL } from "../src/lib/theme";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null);
    if (!name.trim() || !phone.trim() || !password) {
      setErr("Llena todos los campos");
      return;
    }
    if (password.length < 4) {
      setErr("La contraseña debe tener al menos 4 caracteres");
      return;
    }
    setSubmitting(true);
    try {
      const u = await register(phone.trim(), password, name.trim());
      router.replace(u.role === "admin" ? "/(admin)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            testID="register-back-button"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.subtitle}>Solo necesitamos algunos datos.</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            testID="register-name-input"
            value={name} onChangeText={setName}
            placeholder="Tu nombre" placeholderTextColor={colors.textDim}
            style={styles.input}
          />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            testID="register-phone-input"
            value={phone} onChangeText={setPhone}
            keyboardType="phone-pad" placeholder="10 dígitos"
            placeholderTextColor={colors.textDim} style={styles.input}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            testID="register-password-input"
            value={password} onChangeText={setPassword}
            secureTextEntry placeholder="Mínimo 4 caracteres"
            placeholderTextColor={colors.textDim} style={styles.input}
          />

          {err && <Text testID="register-error" style={styles.error}>{err}</Text>}

          <TouchableOpacity
            testID="register-submit-button"
            style={[styles.btn, submitting && { opacity: 0.6 }]}
            onPress={onSubmit} disabled={submitting} activeOpacity={0.85}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Crear cuenta</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24 },
  back: { width: 44, height: 44, justifyContent: "center" },
  logo: { width: "100%", height: 160, alignSelf: "center" },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", marginTop: 12 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: 16 },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: {
    height: 52, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, color: colors.text, fontSize: 16,
  },
  error: { color: colors.danger, marginTop: 12, fontSize: 13 },
  btn: {
    marginTop: 24, backgroundColor: colors.primary, height: 52,
    borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
