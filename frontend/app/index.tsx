import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/lib/auth";
import { colors, LOGO_URL } from "../src/lib/theme";

export default function Login() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "admin" ? "/(admin)/dashboard" : "/(client)/home");
    }
  }, [user, loading]);

  const onSubmit = async () => {
    setErr(null);
    if (!phone.trim() || !password) {
      setErr("Ingresa tu teléfono y contraseña");
      return;
    }
    setSubmitting(true);
    try {
      const u = await login(phone.trim(), password);
      router.replace(u.role === "admin" ? "/(admin)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.bg, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />

          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.subtitle}>
            Agenda el lavado de tu auto en segundos
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              testID="login-phone-input"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="10 dígitos"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />

            {err && <Text testID="login-error" style={styles.error}>{err}</Text>}

            <TouchableOpacity
              testID="login-submit-button"
              style={[styles.btn, submitting && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Iniciar sesión</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="go-to-register-button"
              style={styles.linkBtn}
              onPress={() => router.push("/register")}
            >
              <Text style={styles.linkText}>
                ¿No tienes cuenta?{" "}
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Regístrate
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 12 },
  logo: { width: "100%", height: 220, alignSelf: "center", marginTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: 6, marginBottom: 24 },
  form: { gap: 4 },
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
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkBtn: { alignItems: "center", padding: 16, marginTop: 8 },
  linkText: { color: colors.textMuted, fontSize: 14 },
});
