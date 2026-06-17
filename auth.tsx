import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokenStore, apiError } from "./api";
import { registerForPushAndSync } from "./push";

export type User = {
  id: string;
  phone: string;
  name: string;
  role: "client" | "admin";
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  register: (phone: string, password: string, name: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const t = await tokenStore.get();
      if (!t) { setUser(null); return; }
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      await tokenStore.clear();
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  // Register push token whenever a user is authenticated
  useEffect(() => {
    if (user) { registerForPushAndSync(); }
  }, [user]);

  const login = async (phone: string, password: string) => {
    try {
      const { data } = await api.post("/auth/login", { phone, password });
      await tokenStore.set(data.token);
      setUser(data.user);
      return data.user as User;
    } catch (e) {
      throw new Error(apiError(e));
    }
  };

  const register = async (phone: string, password: string, name: string) => {
    try {
      const { data } = await api.post("/auth/register", { phone, password, name });
      await tokenStore.set(data.token);
      setUser(data.user);
      return data.user as User;
    } catch (e) {
      throw new Error(apiError(e));
    }
  };

  const logout = async () => {
    await tokenStore.clear();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
