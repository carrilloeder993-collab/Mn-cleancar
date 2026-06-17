import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

const TOKEN_KEY = "mn_token";

const secureGet = async (k: string) => {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(k) ?? null;
  return SecureStore.getItemAsync(k);
};
const secureSet = async (k: string, v: string) => {
  if (Platform.OS === "web") return globalThis.localStorage?.setItem(k, v);
  return SecureStore.setItemAsync(k, v);
};
const secureDel = async (k: string) => {
  if (Platform.OS === "web") return globalThis.localStorage?.removeItem(k);
  return SecureStore.deleteItemAsync(k);
};

export const tokenStore = {
  get: () => secureGet(TOKEN_KEY),
  set: (t: string) => secureSet(TOKEN_KEY, t),
  clear: () => secureDel(TOKEN_KEY),
};

api.interceptors.request.use(async (config) => {
  const t = await tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function apiError(e: any): string {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Error de conexión";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg || JSON.stringify(x)).join(" ");
  return String(d);
}
